import "server-only";
import { and, eq, gt, inArray } from "drizzle-orm";
import { getDb } from "../../db/index.ts";
import { options, polls, questions } from "../../db/schema.ts";
import { createPoll } from "./create-poll.ts";
import type { CreatePollQuestionInput } from "./types.ts";

export type DuplicatePollResult =
  | { ok: true; publicCode: string; moderatorToken: string; title: string | null; email: string | null }
  | { ok: false; reason: "poll_not_found" | "not_live" };

/**
 * Nový běh prezentace pro jiné publikum = nové hlasování se stejným
 * obsahem (nový kód pro účastníky, nový moderátorský odkaz). Odpovědi,
 * účastníci a body se nikdy nesmíchají — každý běh je samostatné
 * hlasování, původní zůstává beze změny i se svými výsledky.
 *
 * Obrázky se nekopírují: kopie odkazuje na tytéž soubory (evidence
 * poll_images zůstává u originálu). Úklid je nesmaže, dokud je používá
 * kterékoli platné hlasování (lib/maintenance/cleanup.ts,
 * deleteUnusedPollImagesQuietly kontroluje použití napříč hlasováními).
 */
export async function duplicatePoll(moderatorToken: string): Promise<DuplicatePollResult> {
  const db = getDb();
  const [poll] = await db
    .select({ id: polls.id, title: polls.title, email: polls.email, mode: polls.mode, requireParticipantName: polls.requireParticipantName })
    .from(polls)
    .where(and(eq(polls.moderatorToken, moderatorToken), gt(polls.expiresAt, new Date())))
    .limit(1);
  if (!poll) return { ok: false, reason: "poll_not_found" };
  if (poll.mode !== "live") return { ok: false, reason: "not_live" };

  const slides = await db.select().from(questions).where(eq(questions.pollId, poll.id)).orderBy(questions.position);
  const optionRows = slides.length
    ? await db
        .select()
        .from(options)
        .where(
          inArray(
            options.questionId,
            slides.map((slide) => slide.id)
          )
        )
        .orderBy(options.position)
    : [];

  const indexById = new Map(slides.map((slide, index) => [slide.id, index]));
  const input: CreatePollQuestionInput[] = slides.map((slide) => {
    const slideOptions = optionRows.filter((option) => option.questionId === slide.id);
    const correctIndex = slideOptions.findIndex((option) => option.id === slide.correctOptionId);
    const target = slide.resultsQuestionId === null ? undefined : indexById.get(slide.resultsQuestionId);
    return {
      kind: slide.kind as CreatePollQuestionInput["kind"],
      text: slide.text,
      body: slide.body,
      points: slide.points,
      options: slideOptions.map((option) => ({ text: option.text })),
      link: slide.linkUrl ? { url: slide.linkUrl, label: slide.linkLabel, showDuringVoting: slide.linkShowDuringVoting } : null,
      correctOptionIndex: correctIndex === -1 ? null : correctIndex,
      resultsQuestionIndex: target === undefined ? null : target,
    };
  });

  const created = await createPoll({
    title: poll.title ?? undefined,
    email: poll.email ?? undefined,
    requireParticipantName: poll.requireParticipantName,
    mode: "live",
    questions: input,
  });

  // Obrázky (createPoll je nezná — při běžném vytvoření se nahrávají až potom).
  for (const [index, slide] of slides.entries()) {
    if (!slide.imageUrl) continue;
    await db
      .update(questions)
      .set({ imageUrl: slide.imageUrl, imageWidth: slide.imageWidth, imageHeight: slide.imageHeight, imageAlt: slide.imageAlt })
      .where(eq(questions.id, created.questionIds[index]));
  }

  return { ok: true, publicCode: created.publicCode, moderatorToken: created.moderatorToken, title: poll.title, email: poll.email };
}
