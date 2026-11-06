import "server-only";
import { and, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "../../db/index.ts";
import { options, pollImages, polls, questions, votes } from "../../db/schema.ts";
import { deleteUnusedPollImagesQuietly } from "../images/poll-images.ts";
import { questionImageColumns, questionMediaColumns, toQuestionImages } from "./question-media.ts";
import type { QuestionImage, QuestionStatus, SlideKind, UpdatePollInput, UpdatePollQuestionInput } from "./types.ts";

export type UpdatePollContentResult =
  | { ok: true; version: number }
  | { ok: false; reason: "poll_not_found" | "poll_closed" }
  | { ok: false; reason: "version_conflict"; currentVersion: number }
  | { ok: false; reason: "invalid_change"; message: string };

type ExistingQuestion = {
  id: number;
  kind: SlideKind;
  text: string;
  body: string | null;
  points: number;
  speedBonus: boolean;
  showTimer: boolean;
  status: QuestionStatus;
  images: QuestionImage[];
  linkUrl: string | null;
  linkLabel: string | null;
  linkShowDuringVoting: boolean;
  correctOptionId: number | null;
  options: { id: number; text: string }[];
  voteCount: number;
};

/**
 * Otázka, která už byla spuštěná (nebo má hlasy), je "zamčená": nejde
 * změnit text, odpovědi, obrázek ani odkaz a nejde ji smazat — jinak
 * by se změnil význam už odevzdaných hlasů nebo by se hlasy smazaly
 * (FK cascade). Měnit jde jen její pořadí.
 */
export function isQuestionLocked(question: { status: string; voteCount: number }, mode: string = "live"): boolean {
  // Veřejná anketa je aktivní hned od vytvoření — zamyká ji až první hlas.
  if (mode === "self_service") return question.voteCount > 0;
  return question.status !== "prepared" || question.voteCount > 0;
}

function sameLockedContent(existing: ExistingQuestion, input: UpdatePollQuestionInput): boolean {
  const link = input.link;
  return (
    existing.text === input.text &&
    existing.options.length === input.options.length &&
    existing.options.every((option, index) => option.id === input.options[index].id && option.text === input.options[index].text) &&
    existing.images.length === input.images.length &&
    existing.images.every((image, index) => image.url === input.images[index].url && (image.alt ?? null) === (input.images[index].alt ?? null)) &&
    (existing.linkUrl ?? null) === (link?.url ?? null) &&
    (existing.linkUrl
      ? (existing.linkLabel ?? null) === (link?.label ?? null) && existing.linkShowDuringVoting === (link?.showDuringVoting ?? false)
      : true) &&
    // Správná odpověď spuštěné otázky je zamčená stejně jako odpovědi.
    existing.correctOptionId === (input.correctOptionIndex === null ? null : (input.options[input.correctOptionIndex]?.id ?? null)) &&
    // Body už odehrané otázky by zpětně změnily žebříček.
    (existing.correctOptionId === null || (existing.points === (input.points ?? 1) && existing.speedBonus === (input.speedBonus ?? false)))
  );
}

function questionColumns(input: UpdatePollQuestionInput, position: number) {
  return {
    kind: input.kind ?? "question",
    text: input.text,
    body: input.body ?? null,
    points: input.points ?? 1,
    speedBonus: input.speedBonus ?? false,
    showTimer: input.showTimer ?? (input.kind ?? "question") === "question",
    textCenter: input.textCenter ?? false,
    position,
    ...questionImageColumns(input.images),
    linkUrl: input.link?.url ?? null,
    linkLabel: input.link?.label ?? null,
    linkShowDuringVoting: input.link?.showDuringVoting ?? false,
  };
}

/**
 * Uloží celý požadovaný obsah hlasování z editoru v jedné transakci.
 *
 * - Optimistický zámek: `input.version` musí odpovídat polls.version,
 *   jinak "version_conflict" (jiné okno mezitím uložilo) — nic se tiše
 *   nepřepíše.
 * - Řádek pollu je po dobu transakce zamčený (FOR UPDATE), stejně jako
 *   při spouštění otázky (activate-question.ts), takže otázku nejde
 *   spustit uprostřed ukládání a naopak.
 * - Hlasy se nikdy nemažou: zamčené otázky (viz isQuestionLocked) nejde
 *   změnit ani odstranit, odpovědi se mažou jen u nespuštěných otázek
 *   bez hlasů.
 * - Odpovědi existujících otázek se párují podle ID (update/insert/delete),
 *   takže opakované uložení nevytváří duplicity a ID zůstávají stabilní.
 */
export async function updatePollContent(moderatorToken: string, input: UpdatePollInput): Promise<UpdatePollContentResult> {
  const db = getDb();
  let removedImageUrls: string[] = [];
  let pollId = 0;

  const result = await db.transaction(async (tx): Promise<UpdatePollContentResult> => {
    const [poll] = await tx
      .select({
        id: polls.id,
        status: polls.status,
        version: polls.version,
        mode: polls.mode,
        activeQuestionId: polls.activeQuestionId,
        backgroundImageUrl: polls.backgroundImageUrl,
        backgroundImageWidth: polls.backgroundImageWidth,
        backgroundImageHeight: polls.backgroundImageHeight,
      })
      .from(polls)
      .where(and(eq(polls.moderatorToken, moderatorToken), gt(polls.expiresAt, new Date())))
      .limit(1)
      .for("update");

    if (!poll) return { ok: false, reason: "poll_not_found" };
    if (poll.status !== "active") return { ok: false, reason: "poll_closed" };
    if (poll.version !== input.version) return { ok: false, reason: "version_conflict", currentVersion: poll.version };

    const questionRows = await tx
      .select({
        id: questions.id,
        text: questions.text,
        status: questions.status,
        correctOptionId: questions.correctOptionId,
        kind: questions.kind,
        body: questions.body,
        points: questions.points,
        speedBonus: questions.speedBonus,
        showTimer: questions.showTimer,
        ...questionMediaColumns,
      })
      .from(questions)
      .where(eq(questions.pollId, poll.id));

    const optionRows = await tx
      .select({ id: options.id, questionId: options.questionId, text: options.text })
      .from(options)
      .innerJoin(questions, eq(options.questionId, questions.id))
      .where(eq(questions.pollId, poll.id))
      .orderBy(options.position);

    if (poll.mode === "self_service") {
      // Otázka přijímá hlasy i během editace. Zámek odpovědí (FOR UPDATE
      // koliduje s FK zámkem vkládaného hlasu) zaručí, že hlas buď
      // započítáme níž (→ otázka zamčená), nebo dorazí až po uložení.
      await tx
        .select({ id: options.id })
        .from(options)
        .innerJoin(questions, eq(options.questionId, questions.id))
        .where(eq(questions.pollId, poll.id))
        .for("update", { of: options });
    }

    const voteRows = await tx
      .select({ questionId: votes.questionId, count: sql<number>`count(*)`.mapWith(Number) })
      .from(votes)
      .innerJoin(questions, eq(votes.questionId, questions.id))
      .where(eq(questions.pollId, poll.id))
      .groupBy(votes.questionId);

    const existing = new Map<number, ExistingQuestion>();
    for (const row of questionRows) {
      existing.set(row.id, {
        id: row.id,
        kind: row.kind as SlideKind,
        text: row.text,
        body: row.body,
        points: row.points,
        speedBonus: row.speedBonus,
        showTimer: row.showTimer,
        status: row.status as QuestionStatus,
        images: toQuestionImages(row),
        linkUrl: row.linkUrl,
        linkLabel: row.linkLabel,
        linkShowDuringVoting: row.linkShowDuringVoting,
        correctOptionId: row.correctOptionId,
        options: [],
        voteCount: 0,
      });
    }
    for (const row of optionRows) existing.get(row.questionId)?.options.push({ id: row.id, text: row.text });
    for (const row of voteRows) {
      const question = existing.get(row.questionId);
      if (question) question.voteCount = row.count;
    }

    // Obrázky nahrané do tohoto hlasování (evidence poll_images). K otázce
    // jde uložit jen URL odsud — ne cizí URL (sledovací pixel apod.) ani
    // obrázek jiného hlasování. Navíc obrázky, které už hlasování používá
    // (kopie prezentace pro nový běh sdílí obrázky originálu, viz
    // duplicate-poll.ts) — i pro duplikovaný slajd.
    const ownImages = new Map(
      (
        await tx
          .select({ url: pollImages.url, width: pollImages.width, height: pollImages.height })
          .from(pollImages)
          .where(and(eq(pollImages.pollId, poll.id), isNull(pollImages.deletedAt)))
      ).map((row) => [row.url, row])
    );
    for (const image of [
      ...questionRows.flatMap((row) => toQuestionImages(row)),
      ...(poll.backgroundImageUrl && poll.backgroundImageWidth && poll.backgroundImageHeight
        ? [{ url: poll.backgroundImageUrl, width: poll.backgroundImageWidth, height: poll.backgroundImageHeight }]
        : []),
    ]) {
      if (!ownImages.has(image.url)) ownImages.set(image.url, { url: image.url, width: image.width, height: image.height });
    }

    const invalid = (message: string): UpdatePollContentResult => ({ ok: false, reason: "invalid_change", message });
    const locked = (question: ExistingQuestion) => isQuestionLocked(question, poll.mode);

    if (poll.mode === "self_service" && (input.questions.length !== 1 || input.questions[0].id !== questionRows[0]?.id)) {
      return invalid("Anketa pro web má právě jednu otázku.");
    }
    if (poll.mode === "self_service" && input.questions[0].images.length > 1) {
      return invalid("Anketa pro web může mít jen jeden obrázek.");
    }

    // 1) Nejdřív všechno ověřit, teprve pak zapisovat.
    const seen = new Set<number>();
    for (const [index, question] of input.questions.entries()) {
      const label = `Otázka ${index + 1}`;
      const current = question.id === undefined ? undefined : existing.get(question.id);

      if (question.id !== undefined) {
        if (!current || seen.has(question.id)) return invalid(`${label}: otázka už neexistuje. Načtěte stránku znovu.`);
        seen.add(question.id);
        if (current.kind !== (question.kind ?? "question")) return invalid(`${label}: typ slajdu nelze změnit. Načtěte stránku znovu.`);

        if (locked(current)) {
          if (!sameLockedContent(current, question)) {
            return invalid(`${label}: otázka už byla spuštěná, její obsah nelze měnit.`);
          }
          continue;
        }

        const ownOptionIds = new Set(current.options.map((option) => option.id));
        const usedOptionIds = new Set<number>();
        for (const option of question.options) {
          if (option.id === undefined) continue;
          if (!ownOptionIds.has(option.id) || usedOptionIds.has(option.id)) {
            return invalid(`${label}: neplatná odpověď. Načtěte stránku znovu.`);
          }
          usedOptionIds.add(option.id);
        }
      } else if (question.options.some((option) => option.id !== undefined)) {
        return invalid(`${label}: neplatná odpověď. Načtěte stránku znovu.`);
      }

      // Rozměry vždy podle evidence, ne podle klienta.
      for (const [imageIndex, image] of question.images.entries()) {
        const own = ownImages.get(image.url);
        if (!own) return invalid(`${label}: neplatný obrázek. Nahrajte ho prosím znovu.`);
        question.images[imageIndex] = { ...image, width: own.width, height: own.height };
      }
    }

    // Pozadí prezentace: stejná pravidla jako obrázek otázky (jen vlastní obrázek).
    let background = input.backgroundImage;
    if (background && background.url !== poll.backgroundImageUrl) {
      const own = ownImages.get(background.url);
      if (!own) return invalid("Pozadí prezentace: neplatný obrázek. Nahrajte ho prosím znovu.");
      background = { url: own.url, width: own.width, height: own.height };
    } else if (background) {
      background = { url: background.url, width: poll.backgroundImageWidth ?? background.width, height: poll.backgroundImageHeight ?? background.height };
    }
    const backgroundColumns =
      background === undefined
        ? {}
        : {
            backgroundImageUrl: background?.url ?? null,
            backgroundImageWidth: background?.width ?? null,
            backgroundImageHeight: background?.height ?? null,
          };
    const backgroundAfter = background === undefined ? poll.backgroundImageUrl : (background?.url ?? null);

    const removedQuestions = [...existing.values()].filter((question) => !seen.has(question.id));
    const lockedRemoval = removedQuestions.find(locked);
    if (lockedRemoval) {
      return invalid(`Otázku „${lockedRemoval.text}“ už jste spustili, nelze ji odstranit.`);
    }

    // 2) Zápisy.
    if (removedQuestions.length > 0) {
      await tx.delete(questions).where(
        inArray(
          questions.id,
          removedQuestions.map((question) => question.id)
        )
      );
    }

    // ID slajdů podle pořadí v požadavku — pro vazby výsledkových slajdů.
    const idsByIndex: number[] = [];
    for (const [position, question] of input.questions.entries()) {
      const current = question.id === undefined ? undefined : existing.get(question.id);

      if (current && locked(current)) {
        // „Zobrazovat čas“ jen mění vzhled promítání — jde i u spuštěné otázky.
        await tx.update(questions).set({ position, showTimer: question.showTimer ?? current.showTimer }).where(eq(questions.id, current.id));
        idsByIndex.push(current.id);
        continue;
      }

      if (current) {
        const keptIds = new Set(question.options.flatMap((option) => (option.id === undefined ? [] : [option.id])));
        const droppedIds = current.options.filter((option) => !keptIds.has(option.id)).map((option) => option.id);
        if (droppedIds.length > 0) await tx.delete(options).where(inArray(options.id, droppedIds));

        const optionIds: number[] = [];
        for (const [optionPosition, option] of question.options.entries()) {
          if (option.id !== undefined) {
            await tx.update(options).set({ text: option.text, position: optionPosition }).where(eq(options.id, option.id));
            optionIds.push(option.id);
          } else {
            const [insertedOption] = await tx
              .insert(options)
              .values({ questionId: current.id, text: option.text, position: optionPosition })
              .returning({ id: options.id });
            optionIds.push(insertedOption.id);
          }
        }

        const correctOptionId = question.correctOptionIndex === null ? null : optionIds[question.correctOptionIndex];
        await tx
          .update(questions)
          .set({ ...questionColumns(question, position), correctOptionId })
          .where(eq(questions.id, current.id));
        idsByIndex.push(current.id);
        continue;
      }

      const [inserted] = await tx
        .insert(questions)
        .values({ pollId: poll.id, status: "prepared", ...questionColumns(question, position) })
        .returning({ id: questions.id });
      idsByIndex.push(inserted.id);
      if (question.options.length === 0) continue;
      const insertedOptions = await tx
        .insert(options)
        .values(question.options.map((option, optionPosition) => ({ questionId: inserted.id, text: option.text, position: optionPosition })))
        .returning({ id: options.id, position: options.position });
      const correct = insertedOptions.find((option) => option.position === question.correctOptionIndex);
      if (correct) await tx.update(questions).set({ correctOptionId: correct.id }).where(eq(questions.id, inserted.id));
    }

    // Vazby výsledkových slajdů (index → ID). Bez vazby = NULL, editor ji
    // označí jako chybějící; nikdy se tiše nepřesměruje na jinou otázku.
    for (const [index, question] of input.questions.entries()) {
      if ((question.kind ?? "question") !== "results") continue;
      const target = question.resultsQuestionIndex;
      await tx
        .update(questions)
        .set({ resultsQuestionId: target === undefined || target === null ? null : idsByIndex[target] })
        .where(eq(questions.id, idsByIndex[index]));
    }

    const nextVersion = poll.version + 1;
    // Smazaný promítaný slajd: účastníci se vrátí do čekání.
    const activeRemoved = poll.activeQuestionId !== null && removedQuestions.some((question) => question.id === poll.activeQuestionId);
    await tx
      .update(polls)
      .set({ title: input.title ?? null, version: nextVersion, ...backgroundColumns, ...(activeRemoved ? { activeQuestionId: null } : {}) })
      .where(eq(polls.id, poll.id));

    // Obrázky, na které po uložení už nic neodkazuje (odstraněná otázka,
    // nahrazený/odebraný obrázek). Množinový rozdíl přes celý poll — stejný
    // obrázek může mít i duplikovaná otázka.
    const stillUsed = new Set<string | null>(
      input.questions.flatMap((question) => {
        const current = question.id === undefined ? undefined : existing.get(question.id);
        return (current && locked(current) ? current.images : question.images).map((image) => image.url);
      })
    );
    stillUsed.add(backgroundAfter);
    pollId = poll.id;
    removedImageUrls = [...[...existing.values()].flatMap((question) => question.images.map((image) => image.url)), poll.backgroundImageUrl].filter(
      (url): url is string => Boolean(url) && !stillUsed.has(url)
    );

    return { ok: true, version: nextVersion };
  });

  if (result.ok) await deleteUnusedPollImagesQuietly(pollId, removedImageUrls);
  return result;
}
