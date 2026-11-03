"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type DragEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { LIMITS } from "../../lib/polls/limits.ts";
import type { PollMode, SlideKind } from "../../lib/polls/types.ts";
import { SLIDE_KIND_BADGE, SLIDE_KIND_ICON, SLIDE_KIND_LABEL } from "../../lib/polls/slide-labels.ts";
import { normalizeLinkUrl } from "../../lib/polls/validate.ts";
import { IMAGE_ACCEPT_ATTRIBUTE, prepareImage } from "../../lib/images/prepare-image.ts";
import type { EditorContent, EditorQuestion, QuestionImage } from "../../lib/polls/types.ts";

type OptionDraft = { key: string; id?: number; text: string };
type ImageDraft =
  | { kind: "stored"; url: string; width: number; height: number }
  | { kind: "pending"; blob: Blob; previewUrl: string; width: number; height: number };
/** Jeden obrázek slajdu v editoru (`key` = stabilní klíč pro React a nahrávání). */
type ImageItem = { key: string; draft: ImageDraft; alt: string };
type ImageActions = {
  add: (files: File[]) => void;
  replace: (imageKey: string, file: File) => void;
  remove: (imageKey: string) => void;
  move: (imageKey: string, direction: -1 | 1) => void;
  setAlt: (imageKey: string, alt: string) => void;
};
type QuestionDraft = {
  key: string;
  id?: number;
  // Typ slajdu prezentace (otázka / obsah / výsledky otázky / žebříček).
  kind: SlideKind;
  // Obsahový slajd: text pod nadpisem (`text` = nadpis).
  body: string;
  // Výsledkový slajd: klíč otázky (draftu), jejíž výsledky ukazuje.
  resultsKey: string | null;
  // Body za správnou odpověď (jen otázka se správnou odpovědí).
  points: number;
  // Bonus +3/+2/+1 pro první tři správné odpovědi.
  speedBonus: boolean;
  // Zamčená otázka (spuštěná / s hlasy) — v UI jen pro čtení, při
  // uložení se posílá přesně původní obsah (`original`).
  locked: boolean;
  original?: EditorQuestion;
  text: string;
  expanded: boolean;
  options: OptionDraft[];
  // Klíč odpovědi označené jako správná (nepovinné), null = běžná anketa.
  correctKey: string | null;
  // 0–3 obrázky (vedle sebe na plátně i na telefonu), anketa pro web max. 1.
  images: ImageItem[];
  linkUrl: string;
  linkLabel: string;
  linkShowDuringVoting: boolean;
  linkOpen: boolean;
};

type SaveStatus =
  | { kind: "idle" }
  | { kind: "saving"; message: string }
  | { kind: "saved" }
  | { kind: "error"; message: string }
  | { kind: "conflict"; message: string };

export type PollEditorProps =
  | { mode: "create"; imagesEnabled: boolean; pollMode?: PollMode }
  | { mode: "edit"; imagesEnabled: boolean; moderatorToken: string; initial: EditorContent; uploadFailed?: boolean };

function makeKey() {
  return Math.random().toString(36).slice(2);
}

function emptyOption(): OptionDraft {
  return { key: makeKey(), text: "" };
}

function emptyQuestion(expanded = true, kind: SlideKind = "question"): QuestionDraft {
  return {
    key: makeKey(),
    kind,
    body: "",
    resultsKey: null,
    points: 1,
    speedBonus: false,
    locked: false,
    text: "",
    expanded,
    options: kind === "question" ? [emptyOption(), emptyOption()] : [],
    correctKey: null,
    images: [],
    linkUrl: "",
    linkLabel: "",
    linkShowDuringVoting: false,
    linkOpen: false,
  };
}

// Uložená URL je normalizovaná (percent-encoded) — v poli ji ukážeme čitelně.
function readableUrl(url: string): string {
  try {
    return decodeURI(url);
  } catch {
    return url;
  }
}

function draftFromQuestion(question: EditorQuestion): QuestionDraft {
  return {
    key: `q${question.id}`,
    id: question.id,
    kind: question.kind,
    body: question.body ?? "",
    resultsKey: question.resultsQuestionId ? `q${question.resultsQuestionId}` : null,
    points: question.points,
    speedBonus: question.speedBonus,
    locked: question.locked,
    original: question,
    text: question.text,
    expanded: false,
    options: question.options.map((option) => ({ key: `o${option.id}`, id: option.id, text: option.text })),
    correctKey: question.correctOptionId ? `o${question.correctOptionId}` : null,
    images: question.images.map((image) => ({
      key: makeKey(),
      draft: { kind: "stored", url: image.url, width: image.width, height: image.height },
      alt: image.alt ?? "",
    })),
    linkUrl: question.link ? readableUrl(question.link.url) : "",
    linkLabel: question.link?.label ?? "",
    linkShowDuringVoting: question.link?.showDuringVoting ?? false,
    linkOpen: Boolean(question.link),
  };
}

const LETTERS = "ABCDEFGHIJ";

function revokePending(images: ImageItem[]) {
  for (const item of images) if (item.draft.kind === "pending") URL.revokeObjectURL(item.draft.previewUrl);
}

const UPLOAD_ATTEMPTS = 4;

const ADD_SLIDE: { kind: SlideKind; label: string; hint: string }[] = [
  { kind: "question", label: "+ Otázka", hint: "Účastníci odpovídají z mobilů" },
  { kind: "content", label: "+ Obsah", hint: "Nadpis, text, obrázek" },
  { kind: "results", label: "+ Výsledky otázky", hint: "Graf odpovědí na plátně" },
  { kind: "leaderboard", label: "+ Žebříček", hint: "Pořadí podle bodů" },
];

/** Problém vazby výsledkového slajdu (null = v pořádku). */
function resultsLinkProblem(slide: QuestionDraft, all: QuestionDraft[]): string | null {
  if (!slide.resultsKey) return "vyberte otázku, jejíž výsledky se mají zobrazit.";
  const targetIndex = all.findIndex((q) => q.key === slide.resultsKey);
  if (targetIndex === -1 || all[targetIndex].kind !== "question") return "otázka k výsledkům byla odstraněna — vyberte jinou.";
  if (targetIndex > all.indexOf(slide)) return "otázka k výsledkům je až za tímto slajdem — přesuňte slajd nebo vyberte jinou otázku.";
  return null;
}

async function uploadImage(
  moderatorToken: string,
  blob: Blob,
  onWait: (seconds: number) => void
): Promise<{ url: string; width: number; height: number }> {
  for (let attempt = 1; ; attempt++) {
    const form = new FormData();
    form.append("file", blob, "obrazek");
    const response = await fetch(`/api/polls/moderator/${moderatorToken}/images`, { method: "POST", body: form });
    const body = await response.json().catch(() => ({}));
    if (response.ok) return body;
    // Úložiště (sdílené pro celé Hlasuju) je chvíli vytížené — počkat a zkusit znovu.
    if (body.code === "storage_busy" && attempt < UPLOAD_ATTEMPTS) {
      const seconds = Math.min(Number(body.retryAfter) || 30, 120);
      onWait(seconds);
      await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
      continue;
    }
    throw new Error(body.error ?? "Obrázek se nepodařilo nahrát.");
  }
}

/** Index výsledkového slajdu → otázka podle klíče (null = chybějící vazba). */
function resultsIndex(question: QuestionDraft, all: QuestionDraft[]): number | null {
  if (question.kind !== "results" || !question.resultsKey) return null;
  const index = all.findIndex((other) => other.key === question.resultsKey);
  return index === -1 ? null : index;
}

/** Návrh otázky → vstup pro PUT /content (zamčené otázky beze změny). */
function toPayloadQuestion(question: QuestionDraft, uploaded: Map<string, { url: string; width: number; height: number }>, all: QuestionDraft[]) {
  if (question.locked && question.original) {
    const { id, kind, text, options, images, link, correctOptionId, points, speedBonus } = question.original;
    const correctIndex = options.findIndex((option) => option.id === correctOptionId);
    return { id, kind, text, options, images, link, correctOptionIndex: correctIndex === -1 ? null : correctIndex, points, speedBonus, body: null, resultsQuestionIndex: null };
  }

  const images: QuestionImage[] = question.images.flatMap((item) => {
    const alt = item.alt.trim() || null;
    if (item.draft.kind === "stored") return [{ url: item.draft.url, width: item.draft.width, height: item.draft.height, alt }];
    const stored = uploaded.get(item.key);
    return stored ? [{ ...stored, alt }] : [];
  });

  if (question.kind !== "question") {
    return {
      ...(question.id ? { id: question.id } : {}),
      kind: question.kind,
      text: question.text.trim(),
      options: [] as { id?: number; text: string }[],
      images: question.kind === "content" ? images : [],
      link: null,
      correctOptionIndex: null,
      body: question.kind === "content" ? question.body.trim() || null : null,
      resultsQuestionIndex: resultsIndex(question, all),
      points: 1,
      speedBonus: false,
    };
  }

  const correctIndex = question.options.findIndex((option) => option.key === question.correctKey);
  return {
    ...(question.id ? { id: question.id } : {}),
    kind: question.kind,
    text: question.text.trim(),
    options: question.options.map((option) => ({ ...(option.id ? { id: option.id } : {}), text: option.text.trim() })),
    images,
    link: question.linkUrl.trim()
      ? { url: question.linkUrl.trim(), label: question.linkLabel.trim() || null, showDuringVoting: question.linkShowDuringVoting }
      : null,
    correctOptionIndex: correctIndex === -1 ? null : correctIndex,
    body: null,
    resultsQuestionIndex: null,
    points: question.points,
    speedBonus: correctIndex !== -1 && question.speedBonus,
  };
}

// Jeden editor pro vytvoření i úpravu hlasování (žádná duplicitní logika).
// Otázky se skládají lokálně a ukládají se jedním požadavkem; obrázky se
// nahrávají až při uložení (dřív by vznikaly zbytečné osiřelé soubory).
export default function PollEditor(props: PollEditorProps) {
  const router = useRouter();
  const isEdit = props.mode === "edit";
  // Veřejná anketa pro web: jediná otázka, bez jmenovitého režimu.
  const selfService = (isEdit ? props.initial.mode : props.pollMode) === "self_service";
  const [title, setTitle] = useState(isEdit ? props.initial.title ?? "" : "");
  const [email, setEmail] = useState("");
  const [requireParticipantName, setRequireParticipantName] = useState(false);
  const [honeypot, setHoneypot] = useState("");
  const [version, setVersion] = useState(isEdit ? props.initial.version : 1);
  const [questions, setQuestions] = useState<QuestionDraft[]>(() =>
    isEdit ? props.initial.questions.map(draftFromQuestion) : [emptyQuestion()]
  );
  // Obrázek na pozadí promítání (celá prezentace, jen plátno).
  const [background, setBackground] = useState<ImageDraft | null>(() =>
    isEdit && props.initial.backgroundImage ? { kind: "stored", ...props.initial.backgroundImage } : null
  );
  const [savedIds, setSavedIds] = useState<number[]>(() => (isEdit ? props.initial.questions.map((q) => q.id) : []));
  const [status, setStatus] = useState<SaveStatus>(
    isEdit && props.uploadFailed
      ? { kind: "error", message: "Hlasování bylo vytvořeno, ale některé obrázky se nepodařilo nahrát. Přidejte je prosím znovu a uložte." }
      : { kind: "idle" }
  );
  const [dirty, setDirty] = useState(false);
  const saving = status.kind === "saving";

  // Varování při odchodu s neuloženými změnami.
  useEffect(() => {
    if (!dirty) return;
    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  function change(updater: (prev: QuestionDraft[]) => QuestionDraft[]) {
    setQuestions(updater);
    setDirty(true);
    if (status.kind === "saved" || status.kind === "error") setStatus({ kind: "idle" });
  }

  function updateQuestion(key: string, patch: Partial<QuestionDraft>) {
    change((prev) => prev.map((q) => (q.key === key ? { ...q, ...patch } : q)));
  }

  function toggleQuestion(key: string) {
    // Rozbalení/sbalení není změna obsahu.
    setQuestions((prev) => prev.map((q) => (q.key === key ? { ...q, expanded: !q.expanded } : q)));
  }

  const questionCount = questions.filter((q) => q.kind === "question").length;
  const canAdd = (kind: SlideKind) => questions.length < LIMITS.MAX_SLIDES && (kind !== "question" || questionCount < LIMITS.MAX_QUESTIONS);

  /** Nový slajd na konec; výsledky si předvyberou nejbližší předchozí otázku. */
  function addSlide(kind: SlideKind) {
    if (!canAdd(kind)) return;
    change((prev) => {
      const slide = emptyQuestion(true, kind);
      if (kind === "results") slide.resultsKey = [...prev].reverse().find((q) => q.kind === "question")?.key ?? null;
      return [...prev.map((q) => ({ ...q, expanded: false })), slide];
    });
  }

  /** „Výsledky za tuto otázku“ — slajd hned za otázkou. */
  function addResultsFor(key: string) {
    if (!canAdd("results")) return;
    change((prev) => {
      const index = prev.findIndex((q) => q.key === key);
      if (index === -1) return prev;
      const slide = { ...emptyQuestion(false, "results"), resultsKey: key };
      const next = [...prev];
      next.splice(index + 1, 0, slide);
      return next;
    });
  }

  function removeQuestion(key: string) {
    change((prev) => {
      const target = prev.find((q) => q.key === key);
      if (!target || target.locked || prev.length <= 1) return prev;
      revokePending(target.images);
      return prev.filter((q) => q.key !== key);
    });
  }

  function duplicateQuestion(key: string) {
    change((prev) => {
      const index = prev.findIndex((q) => q.key === key);
      if (index === -1 || prev.length >= LIMITS.MAX_SLIDES) return prev;
      const source = prev[index];
      if (source.kind === "question" && prev.filter((q) => q.kind === "question").length >= LIMITS.MAX_QUESTIONS) return prev;
      const copiedOptions = source.options.map((o) => ({ key: makeKey(), text: o.text }));
      const copy: QuestionDraft = {
        ...emptyQuestion(false, source.kind),
        text: source.text,
        body: source.body,
        // Kopie výsledků ukazuje tutéž otázku (nikdy ne tiše jinou).
        resultsKey: source.resultsKey,
        points: source.points,
        speedBonus: source.speedBonus,
        options: copiedOptions,
        correctKey: copiedOptions[source.options.findIndex((o) => o.key === source.correctKey)]?.key ?? null,
        // Uložené obrázky může sdílet i kopie; nenahrané se musí nahrát znovu.
        images: source.images.filter((item) => item.draft.kind === "stored").map((item) => ({ ...item, key: makeKey() })),
        linkUrl: source.linkUrl,
        linkLabel: source.linkLabel,
        linkShowDuringVoting: source.linkShowDuringVoting,
        linkOpen: source.linkOpen,
      };
      const next = [...prev];
      next.splice(index + 1, 0, copy);
      return next;
    });
  }

  function moveQuestion(key: string, direction: -1 | 1) {
    change((prev) => {
      const index = prev.findIndex((q) => q.key === key);
      const target = index + direction;
      if (index === -1 || target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function updateOptions(questionKey: string, updater: (options: OptionDraft[]) => OptionDraft[]) {
    change((prev) => prev.map((q) => (q.key === questionKey && !q.locked ? { ...q, options: updater(q.options) } : q)));
  }

  const maxImages = selfService ? 1 : LIMITS.MAX_IMAGES_PER_SLIDE;

  function updateImages(questionKey: string, updater: (images: ImageItem[]) => ImageItem[]) {
    change((prev) => prev.map((q) => (q.key === questionKey && !q.locked ? { ...q, images: updater(q.images) } : q)));
  }

  /** Připraví soubory (zmenšení), chyby ukáže; vrací jen úspěšné. */
  async function prepareFiles(files: File[]) {
    const prepared: ImageDraft[] = [];
    for (const file of files) {
      const result = await prepareImage(file);
      if (result.ok) prepared.push({ kind: "pending", ...result.image });
      else setStatus({ kind: "error", message: result.error });
    }
    return prepared;
  }

  function imageActions(questionKey: string): ImageActions {
    return {
      add: async (files) => {
        const prepared = await prepareFiles(files.slice(0, maxImages));
        updateImages(questionKey, (images) => {
          const free = Math.max(0, maxImages - images.length);
          revokePending(prepared.slice(free).map((draft) => ({ key: "", draft, alt: "" })));
          return [...images, ...prepared.slice(0, free).map((draft) => ({ key: makeKey(), draft, alt: "" }))];
        });
      },
      replace: async (imageKey, file) => {
        const [draft] = await prepareFiles([file]);
        if (!draft) return;
        updateImages(questionKey, (images) =>
          images.map((item) => {
            if (item.key !== imageKey) return item;
            revokePending([item]);
            return { ...item, draft };
          })
        );
      },
      remove: (imageKey) =>
        updateImages(questionKey, (images) => {
          revokePending(images.filter((item) => item.key === imageKey));
          return images.filter((item) => item.key !== imageKey);
        }),
      move: (imageKey, direction) =>
        updateImages(questionKey, (images) => {
          const index = images.findIndex((item) => item.key === imageKey);
          const target = index + direction;
          if (index === -1 || target < 0 || target >= images.length) return images;
          const next = [...images];
          [next[index], next[target]] = [next[target], next[index]];
          return next;
        }),
      setAlt: (imageKey, alt) => updateImages(questionKey, (images) => images.map((item) => (item.key === imageKey ? { ...item, alt } : item))),
    };
  }

  async function pickBackground(file: File) {
    const prepared = await prepareImage(file);
    if (!prepared.ok) {
      setStatus({ kind: "error", message: prepared.error });
      return;
    }
    if (background?.kind === "pending") URL.revokeObjectURL(background.previewUrl);
    setBackground({ kind: "pending", ...prepared.image });
    setDirty(true);
  }

  function removeBackground() {
    if (background?.kind === "pending") URL.revokeObjectURL(background.previewUrl);
    setBackground(null);
    setDirty(true);
  }

  /** Nahraje nové pozadí (je-li) a vrátí hodnotu pro PUT /content. */
  async function uploadBackground(moderatorToken: string) {
    if (background?.kind !== "pending") return background ? { url: background.url, width: background.width, height: background.height } : null;
    const progress = "Nahrávám pozadí prezentace…";
    setStatus({ kind: "saving", message: progress });
    return uploadImage(moderatorToken, background.blob, (seconds) =>
      setStatus({ kind: "saving", message: `${progress} Úložiště je vytížené, zkouším znovu za ${seconds} s.` })
    );
  }

  function validateDrafts(): string | null {
    for (const [index, q] of questions.entries()) {
      if (q.locked) continue;
      if (q.kind === "content") {
        if (!q.text.trim() && !q.body.trim() && q.images.length === 0) return `Slajd ${index + 1}: doplňte nadpis, text nebo obrázek.`;
        continue;
      }
      if (q.kind === "results") {
        const problem = resultsLinkProblem(q, questions);
        if (problem) return `Slajd ${index + 1}: ${problem}`;
        continue;
      }
      if (q.kind === "leaderboard") continue;
      if (!q.text.trim()) return `Otázka ${index + 1}: doplňte text otázky.`;
      if (q.options.some((o) => !o.text.trim())) return `Otázka ${index + 1}: doplňte text u všech odpovědí.`;
      if (q.linkUrl.trim() && !normalizeLinkUrl(q.linkUrl)) {
        return `Otázka ${index + 1}: odkaz musí být platná adresa (http:// nebo https://).`;
      }
    }
    return null;
  }

  const requireNames = isEdit ? props.initial.requireParticipantName : requireParticipantName;

  async function uploadPending(moderatorToken: string) {
    const pending = questions.flatMap((q) => (q.locked ? [] : q.images.filter((item) => item.draft.kind === "pending")));
    const uploaded = new Map<string, { url: string; width: number; height: number }>();
    for (const [index, item] of pending.entries()) {
      if (item.draft.kind !== "pending") continue;
      const progress = `Nahrávám obrázek ${index + 1} z ${pending.length}…`;
      setStatus({ kind: "saving", message: progress });
      uploaded.set(
        item.key,
        await uploadImage(moderatorToken, item.draft.blob, (seconds) =>
          setStatus({ kind: "saving", message: `${progress} Úložiště je vytížené, zkouším znovu za ${seconds} s.` })
        )
      );
    }
    return uploaded;
  }

  async function putContent(
    moderatorToken: string,
    payloadVersion: number,
    uploaded: Map<string, { url: string; width: number; height: number }>,
    backgroundImage: { url: string; width: number; height: number } | null,
    idsByKey?: Map<string, number>
  ) {
    const response = await fetch(`/api/polls/moderator/${moderatorToken}/content`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        version: payloadVersion,
        title: title.trim() || undefined,
        // Anketa pro web nemá promítání — pozadí neposílat (= beze změny).
        ...(selfService ? {} : { backgroundImage }),
        questions: questions.map((q) => {
          const payload = toPayloadQuestion(q, uploaded, questions);
          const createdId = idsByKey?.get(q.key);
          // Po vytvoření mají otázky ID, odpovědi ještě ne (vzniknou znovu).
          return createdId ? { ...payload, id: createdId, options: payload.options.map((o) => ({ text: o.text })) } : payload;
        }),
      }),
    });
    const body = await response.json().catch(() => ({}));
    return { response, body };
  }

  async function handleCreate() {
    setStatus({ kind: "saving", message: "Vytvářím hlasování…" });
    const response = await fetch("/api/polls", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim() || undefined,
        email: email.trim() || undefined,
        requireParticipantName: selfService ? false : requireParticipantName,
        mode: selfService ? "self_service" : undefined,
        website: honeypot,
        questions: questions.map((q) => {
          const payload = toPayloadQuestion(q, new Map(), questions);
          return {
            kind: payload.kind,
            text: payload.text,
            options: payload.options,
            link: payload.link,
            correctOptionIndex: payload.correctOptionIndex,
            body: payload.body,
            resultsQuestionIndex: payload.resultsQuestionIndex,
            points: payload.points,
            speedBonus: payload.speedBonus,
          };
        }),
      }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setStatus({ kind: "error", message: body.error ?? "Hlasování se nepodařilo vytvořit." });
      return;
    }

    const token: string = body.moderatorToken;
    const hasImages = questions.some((q) => q.images.some((item) => item.draft.kind === "pending")) || (!selfService && background !== null);
    if (hasImages) {
      try {
        const uploaded = await uploadPending(token);
        const backgroundImage = selfService ? null : await uploadBackground(token);
        const idsByKey = new Map(questions.map((q, index) => [q.key, body.questionIds[index] as number]));
        setStatus({ kind: "saving", message: "Ukládám obrázky k otázkám…" });
        const saved = await putContent(token, 1, uploaded, backgroundImage, idsByKey);
        if (!saved.response.ok) throw new Error(saved.body.error);
      } catch {
        setDirty(false);
        router.push(`/m/${token}/upravit?nahrani=chyba`);
        return;
      }
    }

    setDirty(false);
    router.push(`/m/${token}`);
  }

  async function handleUpdate(moderatorToken: string) {
    const removedCount = savedIds.filter((id) => !questions.some((q) => q.id === id)).length;
    if (
      removedCount > 0 &&
      !window.confirm(
        removedCount === 1
          ? "Uložením trvale odstraníte 1 slajd. Pokračovat?"
          : `Uložením trvale odstraníte ${removedCount} slajdy. Pokračovat?`
      )
    ) {
      return;
    }

    setStatus({ kind: "saving", message: "Ukládám…" });
    const uploaded = await uploadPending(moderatorToken);
    const backgroundImage = await uploadBackground(moderatorToken);
    setStatus({ kind: "saving", message: "Ukládám otázky…" });
    const { response, body } = await putContent(moderatorToken, version, uploaded, backgroundImage);

    if (!response.ok) {
      if (body.code === "version_conflict" || body.code === "poll_closed") {
        setStatus({ kind: "conflict", message: body.error });
      } else {
        setStatus({ kind: "error", message: body.error ?? "Změny se nepodařilo uložit." });
      }
      return;
    }

    const content = body as EditorContent;
    for (const q of questions) revokePending(q.images);
    if (background?.kind === "pending") URL.revokeObjectURL(background.previewUrl);
    setBackground(content.backgroundImage ? { kind: "stored", ...content.backgroundImage } : null);
    setVersion(content.version);
    setSavedIds(content.questions.map((q) => q.id));
    // Zachovat rozbalení podle pozice — po uložení mají nové otázky ID.
    setQuestions(content.questions.map((q, index) => ({ ...draftFromQuestion(q), expanded: questions[index]?.expanded ?? false })));
    setDirty(false);
    setStatus({ kind: "saved" });
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    const error = validateDrafts();
    if (error) {
      setStatus({ kind: "error", message: error });
      return;
    }
    try {
      if (props.mode === "edit") await handleUpdate(props.moderatorToken);
      else await handleCreate();
    } catch (err) {
      setStatus({ kind: "error", message: err instanceof Error && err.message ? err.message : "Uložení se nezdařilo. Zkuste to prosím znovu." });
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <div className={`grid gap-4 rounded-3xl border border-gray-200 bg-white p-5 shadow-soft sm:p-6 ${isEdit ? "" : "sm:grid-cols-2"}`}>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-gray-700">{selfService ? "Název ankety (nepovinné)" : "Název hlasování (nepovinné)"}</span>
          <input
            type="text"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setDirty(true);
            }}
            maxLength={LIMITS.MAX_TITLE_LENGTH}
            placeholder="např. První pomoc – 3. přednáška"
            className="rounded-xl border-2 border-gray-200 bg-white px-4 py-3 text-gray-900 focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/10"
          />
        </label>
        {!isEdit && (
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-gray-700">E-mail pro zaslání odkazu na správu hlasování</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              maxLength={LIMITS.MAX_EMAIL_LENGTH}
              placeholder="vas@email.cz"
              className="rounded-xl border-2 border-gray-200 bg-white px-4 py-3 text-gray-900 focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/10"
            />
            <span className="text-xs text-gray-500">
              Doporučujeme vyplnit — odkaz na správu jinak nejde obnovit. Hlasování platí {LIMITS.POLL_TTL_DAYS} dní od vytvoření a po
              každém spuštění otázky se platnost prodlouží na {LIMITS.POLL_TTL_DAYS} dní od toho okamžiku.
            </span>
          </label>
        )}
        {!isEdit && !selfService && (
          <label className="flex items-start gap-3 rounded-2xl bg-cream px-4 py-3 sm:col-span-2">
            <input
              type="checkbox"
              checked={requireParticipantName}
              onChange={(e) => setRequireParticipantName(e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-gray-300 text-brand focus:ring-brand"
            />
            <span>
              <span className="block text-sm font-medium text-gray-800">Vyžadovat jméno nebo přezdívku účastníka</span>
              <span className="block text-xs text-gray-500">
                Účastníci před hlasováním zadají jméno nebo přezdívku a vy uvidíte, kdo jak odpověděl. Bez zaškrtnutí je hlasování
                anonymní. Po vytvoření už nejde změnit. Jména se smažou nejpozději {LIMITS.POLL_TTL_DAYS + 7} dní po posledním použití hlasování.
              </span>
            </span>
          </label>
        )}
        {!selfService && (
          <BackgroundField
            image={background}
            imagesEnabled={props.imagesEnabled}
            disabled={saving}
            onPick={pickBackground}
            onRemove={removeBackground}
            wide={!isEdit}
          />
        )}
        {/* Honeypot proti botům — člověk pole nevidí. */}
        <input
          type="text"
          name="website"
          value={honeypot}
          onChange={(e) => setHoneypot(e.target.value)}
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          className="hidden"
        />
      </div>

      {!props.imagesEnabled && (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Nahrávání obrázků zatím není na serveru zapnuté. Otázky bez obrázků fungují normálně.
        </p>
      )}

      <ol className="flex flex-col gap-4">
        {questions.map((q, index) => (
          <QuestionCard
            key={q.key}
            question={q}
            index={index}
            total={questions.length}
            all={questions}
            requireNames={requireNames}
            onAddResults={canAdd("results") ? () => addResultsFor(q.key) : undefined}
            single={selfService}
            imagesEnabled={props.imagesEnabled}
            disabled={saving}
            onToggle={() => toggleQuestion(q.key)}
            onChange={(patch) => updateQuestion(q.key, patch)}
            onUpdateOptions={(updater) => updateOptions(q.key, updater)}
            images={imageActions(q.key)}
            maxImages={maxImages}
            onDuplicate={() => duplicateQuestion(q.key)}
            onRemove={() => removeQuestion(q.key)}
            onMoveUp={() => moveQuestion(q.key, -1)}
            onMoveDown={() => moveQuestion(q.key, 1)}
          />
        ))}
      </ol>

      {!selfService && (
        <div className="rounded-3xl border-2 border-dashed border-brand/30 bg-white/60 p-4">
          <p className="text-sm font-semibold text-gray-700">Přidat slajd</p>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {ADD_SLIDE.map((item) => (
              <button
                key={item.kind}
                type="button"
                onClick={() => addSlide(item.kind)}
                disabled={!canAdd(item.kind) || saving}
                className="flex flex-col items-start gap-1 rounded-2xl border-2 border-gray-200 bg-white px-3 py-2.5 text-left transition hover:border-brand hover:bg-brand-light/40 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                  <span className={`flex h-6 w-6 items-center justify-center rounded-md text-xs font-bold ${SLIDE_KIND_BADGE[item.kind]}`}>{SLIDE_KIND_ICON[item.kind]}</span>
                  {item.label}
                </span>
                <span className="text-xs text-gray-500">{item.hint}</span>
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-gray-500">
            Při promítání stačí tlačítko „Další“: otázka se sama otevře a dalším krokem uzavře. Nejvýš {LIMITS.MAX_SLIDES} slajdů, z toho{" "}
            {LIMITS.MAX_QUESTIONS} otázek.
          </p>
        </div>
      )}

      {/* Ukládací lišta je pořád na očích i u dlouhého seznamu otázek. */}
      <div className="sticky bottom-0 z-10 -mx-4 border-t border-gray-200 bg-white/95 px-4 py-4 shadow-[0_-8px_24px_-12px_rgba(76,64,150,0.25)] backdrop-blur sm:bottom-3 sm:mx-0 sm:rounded-2xl sm:border">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <StatusMessage status={status} dirty={dirty} isEdit={isEdit} />
          <div className="flex shrink-0 flex-wrap items-center gap-3">
            {status.kind === "conflict" && (
              <button
                type="button"
                onClick={() => {
                  setDirty(false);
                  window.location.reload();
                }}
                className="rounded-2xl border-2 border-gray-300 bg-white px-5 py-3 text-sm font-semibold text-gray-800 hover:border-brand hover:text-brand"
              >
                Načíst aktuální verzi
              </button>
            )}
            {isEdit && (
              <Link href={`/m/${props.moderatorToken}`} className="px-2 text-sm font-semibold text-gray-600 hover:text-brand hover:underline">
                Zpět na řízení
              </Link>
            )}
            <button
              type="submit"
              disabled={saving || (isEdit && !dirty)}
              className="min-h-[52px] rounded-2xl bg-brand px-6 py-3 text-base font-semibold text-white shadow-soft transition hover:bg-brand-dark focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/30 disabled:opacity-60"
            >
              {saving ? "Ukládám…" : isEdit ? "Uložit změny" : selfService ? "Vytvořit anketu" : "Vytvořit hlasování"}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}

function StatusMessage({ status, dirty, isEdit }: { status: SaveStatus; dirty: boolean; isEdit: boolean }) {
  switch (status.kind) {
    case "saving":
      return (
        <p className="text-sm font-medium text-gray-700" role="status">
          {status.message}
        </p>
      );
    case "saved":
      return (
        <p className="text-sm font-semibold text-green-700" role="status">
          ✓ Změny jsou uložené.
        </p>
      );
    case "error":
    case "conflict":
      return (
        <p className="text-sm font-medium text-red-600" role="alert">
          {status.message}
        </p>
      );
    default:
      return (
        <p className="text-sm text-gray-500">
          {isEdit ? (dirty ? "Máte neuložené změny." : "Všechny změny jsou uložené.") : "Po vytvoření dostanete kód pro účastníky a odkaz na řízení."}
        </p>
      );
  }
}

function QuestionCard({
  question,
  index,
  total,
  imagesEnabled,
  disabled,
  onToggle,
  onChange,
  onUpdateOptions,
  images,
  maxImages,
  onDuplicate,
  onRemove,
  single = false,
  onMoveUp,
  onMoveDown,
  all,
  requireNames,
  onAddResults,
}: {
  question: QuestionDraft;
  index: number;
  total: number;
  all: QuestionDraft[];
  requireNames: boolean;
  onAddResults?: () => void;
  imagesEnabled: boolean;
  disabled: boolean;
  onToggle: () => void;
  onChange: (patch: Partial<QuestionDraft>) => void;
  onUpdateOptions: (updater: (options: OptionDraft[]) => OptionDraft[]) => void;
  images: ImageActions;
  maxImages: number;
  onDuplicate: () => void;
  onRemove: () => void;
  /** Anketa pro web: jediná otázka — bez přesunu, duplikace a mazání. */
  single?: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const actionClass = "rounded-lg px-2 py-1 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-900 disabled:opacity-30";
  const linkProblem = question.kind === "results" ? resultsLinkProblem(question, all) : null;
  const summary = slideSummary(question, all);

  return (
    <li className={`rounded-3xl border shadow-soft ${question.locked ? "border-gray-200 bg-gray-50" : "border-gray-200 bg-white"}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-t-3xl border-b border-gray-100 bg-brand-light/40 px-4 py-3 sm:px-5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-bold text-white">{index + 1}</span>
        {!single && (
          <span
            className={`flex h-8 shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-bold ${SLIDE_KIND_BADGE[question.kind]}`}
            title={SLIDE_KIND_LABEL[question.kind]}
          >
            <span aria-hidden="true">{SLIDE_KIND_ICON[question.kind]}</span>
            <span className="hidden sm:inline">{SLIDE_KIND_LABEL[question.kind]}</span>
          </span>
        )}
        <button type="button" onClick={onToggle} className="min-w-0 flex-1 text-left" aria-expanded={question.expanded}>
          <span className="block truncate font-semibold text-gray-900">{summary.title}</span>
          <span className={`block truncate text-xs ${linkProblem ? "font-semibold text-red-600" : "text-gray-500"}`}>
            {linkProblem ? `⚠ ${linkProblem}` : summary.detail}
          </span>
        </button>
        {question.locked && (
          <span className="rounded-full bg-pastel-blue px-2.5 py-1 text-xs font-semibold text-gray-700" title="Otázka už byla spuštěná — změnit jde jen její pořadí.">
            🔒 Spuštěno – nelze upravit
          </span>
        )}
        <div className="flex flex-wrap items-center gap-1">
          {!single && (
            <>
            <button type="button" onClick={onMoveUp} disabled={disabled || index === 0} className={actionClass} aria-label="Posunout nahoru">
              ↑
            </button>
            <button type="button" onClick={onMoveDown} disabled={disabled || index === total - 1} className={actionClass} aria-label="Posunout dolů">
              ↓
            </button>
            <button type="button" onClick={onDuplicate} disabled={disabled} className={actionClass}>
              Duplikovat
            </button>
            {!question.locked && (
              <button type="button" onClick={onRemove} disabled={disabled || total <= 1} className={`${actionClass} text-red-600 hover:text-red-700`}>
                Odstranit
              </button>
            )}
            </>
          )}
          <button type="button" onClick={onToggle} className="rounded-lg px-2 py-1 text-sm font-semibold text-brand hover:bg-brand/5">
            {question.expanded ? "Sbalit" : question.locked ? "Zobrazit" : "Upravit"}
          </button>
        </div>
      </div>

      {question.expanded && (
        <div className="flex flex-col gap-5 px-4 py-5 sm:px-5">
          {question.locked ? (
            <LockedQuestionBody question={question} />
          ) : question.kind === "content" ? (
            <ContentFields
              question={question}
              imagesEnabled={imagesEnabled}
              disabled={disabled}
              onChange={onChange}
              images={images}
              maxImages={maxImages}
            />
          ) : question.kind === "results" ? (
            <ResultsFields question={question} all={all} problem={linkProblem} onChange={onChange} />
          ) : question.kind === "leaderboard" ? (
            <LeaderboardFields question={question} all={all} requireNames={requireNames} onChange={onChange} />
          ) : (
            <>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-gray-700">Text otázky</span>
                <textarea
                  value={question.text}
                  onChange={(e) => onChange({ text: e.target.value })}
                  maxLength={LIMITS.MAX_QUESTION_LENGTH}
                  rows={2}
                  placeholder="např. O jaký typ zranění se jedná?"
                  className="resize-y rounded-xl border-2 border-gray-200 px-4 py-2.5 text-gray-900 focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/10"
                />
              </label>

              <ImageField images={question.images} max={maxImages} imagesEnabled={imagesEnabled} disabled={disabled} actions={images} />

              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium text-gray-700">Odpovědi</span>
                {question.options.map((option, optionIndex) => (
                  <div key={option.key} className="flex items-center gap-2">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-light text-sm font-bold text-brand-dark">{LETTERS[optionIndex]}</span>
                    <input
                      type="text"
                      value={option.text}
                      onChange={(e) =>
                        onUpdateOptions((options) => options.map((o) => (o.key === option.key ? { ...o, text: e.target.value } : o)))
                      }
                      maxLength={LIMITS.MAX_OPTION_LENGTH}
                      placeholder="Text odpovědi"
                      className="w-full rounded-xl border-2 border-gray-200 px-4 py-2.5 text-gray-900 focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/10"
                    />
                    <label
                      className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-2 py-2 text-sm text-gray-600 hover:bg-pastel-green has-[:checked]:bg-pastel-green has-[:checked]:font-semibold has-[:checked]:text-emerald-800"
                      title="Označit jako správnou odpověď"
                    >
                      <input
                        type="radio"
                        name={`correct-${question.key}`}
                        checked={question.correctKey === option.key}
                        onChange={() => onChange({ correctKey: option.key })}
                        className="h-4 w-4 accent-emerald-700"
                      />
                      <span className="hidden sm:inline">Správná</span>
                      <span className="sr-only sm:hidden">Odpověď {LETTERS[optionIndex]} je správná</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => onUpdateOptions((options) => (options.length > LIMITS.MIN_OPTIONS ? options.filter((o) => o.key !== option.key) : options))}
                      disabled={question.options.length <= LIMITS.MIN_OPTIONS}
                      className="shrink-0 rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-30"
                      aria-label={`Odstranit odpověď ${LETTERS[optionIndex]}`}
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => onUpdateOptions((options) => (options.length < LIMITS.MAX_OPTIONS ? [...options, emptyOption()] : options))}
                  disabled={question.options.length >= LIMITS.MAX_OPTIONS}
                  className="self-start pl-9 text-sm font-semibold text-brand hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                >
                  + Přidat odpověď
                </button>
                <p className="pl-9 text-xs text-gray-500">
                  Správná odpověď je nepovinná. Účastníci ji uvidí až po ukončení otázky.
                  {question.options.some((o) => o.key === question.correctKey) && (
                    <>
                      {" "}
                      <button type="button" onClick={() => onChange({ correctKey: null })} className="font-semibold text-brand hover:underline">
                        Zrušit správnou odpověď
                      </button>
                    </>
                  )}
                </p>
                {!single && question.options.some((o) => o.key === question.correctKey) && (
                  <ScoringFields question={question} onChange={onChange} />
                )}
              </div>

              <LinkField question={question} onChange={onChange} />
            </>
          )}
          {!single && question.kind === "question" && onAddResults && (
            <ResultsShortcut question={question} all={all} onAdd={onAddResults} />
          )}
        </div>
      )}
    </li>
  );
}

function previewUrlOf(draft: ImageDraft): string {
  return draft.kind === "pending" ? draft.previewUrl : draft.url;
}

function LockedQuestionBody({ question }: { question: QuestionDraft }) {
  return (
    <div className="flex flex-col gap-3 text-gray-700">
      <p className="text-sm text-gray-500">
        Otázka už byla spuštěná{question.original?.voteCount ? ` a má ${question.original.voteCount} hlasů` : ""}. Aby výsledky zůstaly
        platné, nelze ji měnit ani odstranit — jen přesunout v pořadí.
      </p>
      <p className="font-semibold text-gray-900">{question.text}</p>
      {question.images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {question.images.map((item) => (
            // eslint-disable-next-line @next/next/no-img-element -- náhled v editoru
            <img key={item.key} src={previewUrlOf(item.draft)} alt={item.alt || "Obrázek k otázce"} className="max-h-48 w-auto rounded-xl object-contain" />
          ))}
        </div>
      )}
      <ul className="flex flex-col gap-1 text-sm">
        {question.options.map((option, optionIndex) => (
          <li key={option.key}>
            <span className="mr-2 font-bold text-gray-400">{LETTERS[optionIndex]}</span>
            {option.text}
            {option.key === question.correctKey && <span className="ml-2 font-semibold text-emerald-800">✓ správná</span>}
          </li>
        ))}
      </ul>
      {question.linkUrl && <p className="truncate text-sm text-gray-500">Odkaz: {question.linkUrl}</p>}
    </div>
  );
}

function ImageField({
  images,
  max,
  imagesEnabled,
  disabled,
  actions,
}: {
  images: ImageItem[];
  max: number;
  imagesEnabled: boolean;
  disabled: boolean;
  actions: ImageActions;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLInputElement>(null);
  const replaceKey = useRef<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const canAdd = images.length < max;

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    const files = [...(event.dataTransfer.files ?? [])];
    if (files.length > 0 && imagesEnabled && !disabled && canAdd) actions.add(files);
  }

  return (
    <div className="flex flex-col gap-3">
      <span className="text-sm font-medium text-gray-700">
        {max > 1 ? `Obrázky (nepovinné, až ${max} vedle sebe)` : "Obrázek (nepovinné)"}
      </span>
      <input
        ref={inputRef}
        type="file"
        accept={IMAGE_ACCEPT_ATTRIBUTE}
        multiple={max > 1}
        className="hidden"
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          if (files.length > 0) actions.add(files);
          e.target.value = "";
        }}
      />
      <input
        ref={replaceRef}
        type="file"
        accept={IMAGE_ACCEPT_ATTRIBUTE}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file && replaceKey.current) actions.replace(replaceKey.current, file);
          e.target.value = "";
        }}
      />

      {images.length > 0 && (
        <ul className={`grid gap-3 ${images.length > 1 ? "sm:grid-cols-3" : ""}`}>
          {images.map((item, index) => (
            <li key={item.key} className="flex flex-col gap-2 rounded-2xl border border-gray-200 bg-cream p-3">
              {/* eslint-disable-next-line @next/next/no-img-element -- lokální náhled (blob:) nebo obrázek z Content API */}
              <img
                src={previewUrlOf(item.draft)}
                alt={item.alt || "Náhled obrázku"}
                className={`mx-auto w-auto rounded-xl object-contain ${images.length > 1 ? "max-h-40" : "max-h-72"}`}
              />
              {item.draft.kind === "pending" && <p className="text-center text-xs text-gray-500">Obrázek se nahraje při uložení.</p>}
              <div className="flex flex-wrap items-center gap-1">
                {images.length > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={() => actions.move(item.key, -1)}
                      disabled={disabled || index === 0}
                      aria-label="Posunout obrázek doleva"
                      className="rounded-lg px-2 py-1 text-sm text-gray-600 hover:bg-white disabled:opacity-30"
                    >
                      ←
                    </button>
                    <button
                      type="button"
                      onClick={() => actions.move(item.key, 1)}
                      disabled={disabled || index === images.length - 1}
                      aria-label="Posunout obrázek doprava"
                      className="rounded-lg px-2 py-1 text-sm text-gray-600 hover:bg-white disabled:opacity-30"
                    >
                      →
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => {
                    replaceKey.current = item.key;
                    replaceRef.current?.click();
                  }}
                  disabled={disabled || !imagesEnabled}
                  className="rounded-lg px-2 py-1 text-sm font-semibold text-gray-700 hover:bg-white hover:text-brand disabled:opacity-50"
                >
                  Nahradit
                </button>
                <button
                  type="button"
                  onClick={() => actions.remove(item.key)}
                  disabled={disabled}
                  className="rounded-lg px-2 py-1 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  Odebrat
                </button>
              </div>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-gray-600">Popis pro nevidomé (nepovinné)</span>
                <input
                  type="text"
                  value={item.alt}
                  onChange={(e) => actions.setAlt(item.key, e.target.value)}
                  maxLength={LIMITS.MAX_IMAGE_ALT_LENGTH}
                  placeholder="např. RTG hrudníku, zadopřední projekce"
                  className="rounded-xl border-2 border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/10"
                />
              </label>
            </li>
          ))}
        </ul>
      )}

      {canAdd && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            if (imagesEnabled) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          disabled={disabled || !imagesEnabled}
          className={`flex flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed px-4 text-center transition disabled:cursor-not-allowed disabled:opacity-50 ${
            images.length > 0 ? "py-3" : "py-6"
          } ${dragging ? "border-brand bg-brand-light/60" : "border-brand/25 bg-cream hover:border-brand hover:bg-brand-light/40"}`}
        >
          <span className="font-semibold text-brand">{images.length > 0 ? "+ Přidat další obrázek" : "+ Přidat obrázek"}</span>
          <span className="text-xs text-gray-500">
            Klikněte nebo sem přetáhněte {max > 1 ? `soubory (zbývá ${max - images.length})` : "soubor"} · JPEG, PNG, WebP, GIF (bez animace) · velké
            fotky se zmenší
          </span>
        </button>
      )}
    </div>
  );
}

function LinkField({ question, onChange }: { question: QuestionDraft; onChange: (patch: Partial<QuestionDraft>) => void }) {
  if (!question.linkOpen) {
    return (
      <button type="button" onClick={() => onChange({ linkOpen: true })} className="self-start text-sm font-semibold text-brand hover:underline">
        + Přidat odkaz (zdroj, další informace)
      </button>
    );
  }

  const invalid = question.linkUrl.trim() !== "" && !normalizeLinkUrl(question.linkUrl);

  return (
    <fieldset className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-cream/60 p-4">
      <legend className="px-1 text-sm font-medium text-gray-700">Odkaz – zdroj / další informace</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-gray-600">Adresa (URL)</span>
          {/* type="text", ne "url": nativní validace prohlížeče by tiše
              zablokovala odeslání adresy bez https:// (tu doplňujeme sami). */}
          <input
            type="text"
            inputMode="url"
            autoComplete="url"
            value={question.linkUrl}
            onChange={(e) => onChange({ linkUrl: e.target.value })}
            maxLength={LIMITS.MAX_LINK_URL_LENGTH}
            placeholder="https://…"
            aria-invalid={invalid}
            className={`rounded-xl border-2 px-4 py-2.5 text-gray-900 focus:outline-none ${invalid ? "border-red-300 focus:border-red-500" : "border-gray-200 focus:border-brand focus:ring-4 focus:ring-brand/10"}`}
          />
          {invalid && <span className="text-xs text-red-600">Zadejte platnou adresu začínající http:// nebo https://.</span>}
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-gray-600">Popisek (nepovinné)</span>
          <input
            type="text"
            value={question.linkLabel}
            onChange={(e) => onChange({ linkLabel: e.target.value })}
            maxLength={LIMITS.MAX_LINK_LABEL_LENGTH}
            placeholder="např. Zdroj fotografie"
            className="rounded-xl border-2 border-gray-200 px-4 py-2.5 text-gray-900 focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/10"
          />
        </label>
      </div>
      <label className="flex items-start gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={question.linkShowDuringVoting}
          onChange={(e) => onChange({ linkShowDuringVoting: e.target.checked })}
          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand focus:ring-brand"
        />
        <span>
          Zobrazit studentům už během hlasování
          <span className="block text-xs text-gray-500">
            Ve výchozím stavu se odkaz ukáže až po ukončení otázky — může totiž prozradit správnou odpověď.
          </span>
        </span>
      </label>
      <button
        type="button"
        onClick={() => onChange({ linkOpen: false, linkUrl: "", linkLabel: "", linkShowDuringVoting: false })}
        className="self-start text-sm font-semibold text-red-600 hover:underline"
      >
        Odebrat odkaz
      </button>
    </fieldset>
  );
}

function contentLayout(question: QuestionDraft): string {
  const title = question.text.trim();
  const body = question.body.trim();
  const pictures = question.images.length > 1 ? `${question.images.length} obrázky vedle sebe` : "obrázek";
  if (question.images.length > 0 && !body) return title ? `Nadpis a ${pictures}` : question.images.length > 1 ? `Samotné ${pictures}` : "Samotný obrázek";
  if (question.images.length > 0) return `Nadpis, text a ${pictures}`;
  if (body) return title ? "Nadpis a text" : "Samotný text";
  return title ? "Samotný nadpis" : "Prázdný slajd";
}

function scoredBefore(question: QuestionDraft, all: QuestionDraft[]): number {
  const index = all.indexOf(question);
  return all.slice(0, index).filter((q) => q.kind === "question" && q.options.some((o) => o.key === q.correctKey)).length;
}

/** Název a stručný náhled slajdu do hlavičky karty. */
function slideSummary(question: QuestionDraft, all: QuestionDraft[]): { title: string; detail: string } {
  switch (question.kind) {
    case "content":
      return {
        title: question.text.trim() || question.body.trim().split("\n")[0] || (question.images.length > 0 ? "Obrázek" : "Nový obsah"),
        detail: contentLayout(question),
      };
    case "results": {
      const targetIndex = all.findIndex((q) => q.key === question.resultsKey);
      const target = all[targetIndex];
      return {
        title: target ? `Výsledky: ${target.text.trim() || "Nová otázka"}` : "Výsledky otázky",
        detail: target ? `Ke slajdu ${targetIndex + 1}` : "",
      };
    }
    case "leaderboard": {
      const scored = scoredBefore(question, all);
      return {
        title: question.text.trim() || "Průběžné pořadí",
        detail: scored ? `Započítá ${scored} ${scored === 1 ? "bodovanou otázku" : scored <= 4 ? "bodované otázky" : "bodovaných otázek"} před tímto slajdem` : "Před slajdem není bodovaná otázka",
      };
    }
    default: {
      const correct = question.options.some((o) => o.key === question.correctKey);
      return {
        title: question.text.trim() || "Nová otázka",
        detail: [
          `${question.options.length} odpovědi`,
          question.images.length > 1 ? `${question.images.length} obrázky` : question.images.length === 1 ? "obrázek" : "",
          question.linkUrl.trim() ? "odkaz" : "",
          correct ? `bodovaná (${question.points} b.${question.speedBonus ? " + bonus za rychlost" : ""})` : "",
        ]
          .filter(Boolean)
          .join(" · "),
      };
    }
  }
}

function ContentFields({
  question,
  imagesEnabled,
  disabled,
  onChange,
  images,
  maxImages,
}: {
  question: QuestionDraft;
  imagesEnabled: boolean;
  disabled: boolean;
  onChange: (patch: Partial<QuestionDraft>) => void;
  images: ImageActions;
  maxImages: number;
}) {
  const lines = question.body.split("\n").filter((line) => line.trim()).length;
  const longBody = question.body.trim().length > LIMITS.SLIDE_BODY_WARN_LENGTH || lines > 8;
  const longTitle = question.text.trim().length > LIMITS.SLIDE_TITLE_WARN_LENGTH;

  return (
    <>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-gray-700">Nadpis</span>
        <input
          type="text"
          value={question.text}
          onChange={(e) => onChange({ text: e.target.value })}
          maxLength={LIMITS.MAX_QUESTION_LENGTH}
          placeholder="např. Vítejte na školení"
          className="rounded-xl border-2 border-gray-200 px-4 py-2.5 text-lg font-semibold text-gray-900 focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/10"
        />
        {longTitle && <span className="text-xs text-amber-700">Dlouhý nadpis bude na plátně zalomený do více řádků. Zkuste ho zkrátit.</span>}
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-gray-700">Text (nepovinné)</span>
        <textarea
          value={question.body}
          onChange={(e) => onChange({ body: e.target.value })}
          maxLength={LIMITS.MAX_SLIDE_BODY_LENGTH}
          rows={5}
          placeholder={"Krátký text pro publikum.\n\n- odrážka\n- další odrážka"}
          className="resize-y rounded-xl border-2 border-gray-200 px-4 py-2.5 text-gray-900 focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/10"
        />
        <span className="text-xs text-gray-500">
          Prázdný řádek = nový odstavec. Řádky začínající „- “ se zobrazí jako odrážky. {question.body.trim().length}/{LIMITS.MAX_SLIDE_BODY_LENGTH} znaků.
        </span>
        {longBody && (
          <span className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
            Hodně textu bude při promítání špatně čitelné ze zadních řad. Zkuste ho zkrátit nebo rozdělit na dva slajdy.
          </span>
        )}
      </label>

      <ImageField images={question.images} max={maxImages} imagesEnabled={imagesEnabled} disabled={disabled} actions={images} />
      <p className="text-xs text-gray-500">
        Rozložení se nastaví samo podle vyplněných polí: <span className="font-semibold text-gray-700">{contentLayout(question)}</span>. Obrázek se
        nedeformuje, jen zmenší, aby se vešel.
      </p>
    </>
  );
}

function ResultsFields({
  question,
  all,
  problem,
  onChange,
}: {
  question: QuestionDraft;
  all: QuestionDraft[];
  problem: string | null;
  onChange: (patch: Partial<QuestionDraft>) => void;
}) {
  const index = all.indexOf(question);
  const candidates = all.slice(0, index).flatMap((q, position) => (q.kind === "question" ? [{ q, position }] : []));
  const value = candidates.some(({ q }) => q.key === question.resultsKey) ? question.resultsKey ?? "" : "";

  return (
    <div className="flex flex-col gap-2">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-gray-700">Výsledky které otázky?</span>
        <select
          value={value}
          onChange={(e) => onChange({ resultsKey: e.target.value || null })}
          aria-invalid={Boolean(problem)}
          className={`rounded-xl border-2 bg-white px-4 py-2.5 text-gray-900 focus:outline-none focus:ring-4 ${
            problem ? "border-red-300 focus:border-red-500 focus:ring-red-100" : "border-gray-200 focus:border-brand focus:ring-brand/10"
          }`}
        >
          <option value="">— vyberte otázku —</option>
          {candidates.map(({ q, position }) => (
            <option key={q.key} value={q.key}>
              Slajd {position + 1}: {q.text.trim() || "Nová otázka"}
            </option>
          ))}
        </select>
      </label>
      {problem && <p className="text-sm font-medium text-red-600">⚠ {problem.charAt(0).toUpperCase() + problem.slice(1)}</p>}
      {candidates.length === 0 && <p className="text-sm text-gray-600">Před tímto slajdem zatím není žádná otázka. Přesuňte ho za otázku.</p>}
      <p className="text-xs text-gray-500">
        Na plátně se ukáže rozložení odpovědí, počet odpovídajících a u otázky se správnou odpovědí i vyhodnocení. Odpovídání se uzavře už
        přechodem na tento slajd.
      </p>
    </div>
  );
}

function LeaderboardFields({
  question,
  all,
  requireNames,
  onChange,
}: {
  question: QuestionDraft;
  all: QuestionDraft[];
  requireNames: boolean;
  onChange: (patch: Partial<QuestionDraft>) => void;
}) {
  const scored = scoredBefore(question, all);
  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-gray-700">Nadpis</span>
        <input
          type="text"
          value={question.text}
          onChange={(e) => onChange({ text: e.target.value })}
          maxLength={LIMITS.MAX_QUESTION_LENGTH}
          placeholder="Průběžné pořadí"
          className="rounded-xl border-2 border-gray-200 px-4 py-2.5 text-gray-900 focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/10"
        />
      </label>
      <div className="flex flex-wrap gap-2">
        {["Průběžné pořadí", "Konečné výsledky"].map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => onChange({ text: preset })}
            className="rounded-lg border border-gray-200 px-3 py-1 text-xs font-semibold text-gray-700 hover:border-brand hover:text-brand"
          >
            {preset}
          </button>
        ))}
      </div>
      {scored === 0 ? (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Před tímto slajdem není žádná bodovaná otázka. Body se počítají jen u otázek s označenou správnou odpovědí — běžné hlasování body nedává.
        </p>
      ) : (
        <p className="rounded-xl bg-pastel-green/60 px-4 py-3 text-sm text-gray-800">
          Započítá {scored} {scored === 1 ? "bodovanou otázku" : scored <= 4 ? "bodované otázky" : "bodovaných otázek"} před tímto slajdem, které už
          byly při promítání uzavřené. Pozdější otázky se do tohoto pořadí nepočítají.
        </p>
      )}
      {!requireNames && (
        <p className="text-xs text-gray-500">
          Hlasování je anonymní, v pořadí proto budou „Anonymní účastník 1, 2, …“. Přezdívky ukáže jen hlasování se zapnutým zadáváním jména (volí se
          při vytvoření).
        </p>
      )}
      <p className="text-xs text-gray-500">Na plátně se ukáže prvních {LIMITS.LEADERBOARD_PAGE_SIZE} míst, další místa tlačítkem v promítání.</p>
    </div>
  );
}

function ResultsShortcut({ question, all, onAdd }: { question: QuestionDraft; all: QuestionDraft[]; onAdd: () => void }) {
  const existing = all.findIndex((q) => q.kind === "results" && q.resultsKey === question.key);
  if (existing !== -1) {
    return <p className="text-xs text-gray-500">Výsledky této otázky jsou na slajdu {existing + 1}.</p>;
  }
  return (
    <button type="button" onClick={onAdd} className="self-start text-sm font-semibold text-brand hover:underline">
      + Výsledky za tuto otázku (slajd hned za ní)
    </button>
  );
}

/** Body za správnou odpověď a volitelný bonus za rychlost (+3/+2/+1). */
function ScoringFields({ question, onChange }: { question: QuestionDraft; onChange: (patch: Partial<QuestionDraft>) => void }) {
  const [first, second, third] = LIMITS.SPEED_BONUS;
  return (
    <div className="ml-9 rounded-xl bg-pastel-green/60 px-3 py-2 text-sm text-gray-800">
      <label className="flex flex-wrap items-center gap-2">
        <span className="font-medium">Body za správnou odpověď</span>
        <input
          type="number"
          min={1}
          max={LIMITS.MAX_POINTS}
          value={question.points}
          onChange={(e) => onChange({ points: Math.min(LIMITS.MAX_POINTS, Math.max(1, Math.round(Number(e.target.value) || 1))) })}
          className="w-20 rounded-lg border-2 border-gray-200 bg-white px-2 py-1 text-gray-900 focus:border-brand focus:outline-none"
        />
      </label>
      <label className="mt-2 flex items-start gap-2">
        <input
          type="checkbox"
          checked={question.speedBonus}
          onChange={(e) =>
            // Se zapnutým bonusem dává smysl vyšší základ (2 + 3 = max. 5 b.).
            onChange(e.target.checked && question.points === 1 ? { speedBonus: true, points: 2 } : { speedBonus: e.target.checked })
          }
          className="mt-0.5 h-4 w-4 accent-brand"
        />
        <span>
          <span className="font-medium">Bonus za rychlost</span>
          <span className="block text-xs text-gray-600">
            {question.speedBonus
              ? `Nejrychlejší správná odpověď ${question.points + first} b., druhá ${question.points + second} b., třetí ${question.points + third} b., ostatní správné ${question.points} b., špatně 0. Rozhoduje čas, kdy odpověď dorazí na server.`
              : `První tři správné odpovědi získají navíc +${first}, +${second} a +${third} body.`}
          </span>
        </span>
      </label>
      {!question.speedBonus && <p className="mt-1 text-xs text-gray-600">Správně = tolik bodů, jinak 0. Záporné body nejsou.</p>}
    </div>
  );
}

/** Obrázek na pozadí celé prezentace (jen na plátně, bez ztlumení). */
function BackgroundField({
  image,
  imagesEnabled,
  disabled,
  onPick,
  onRemove,
  wide,
}: {
  image: ImageDraft | null;
  imagesEnabled: boolean;
  disabled: boolean;
  onPick: (file: File) => void;
  onRemove: () => void;
  wide: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const previewUrl = image?.kind === "pending" ? image.previewUrl : image?.url;

  return (
    <div className={`flex flex-col gap-1.5 ${wide ? "sm:col-span-2" : ""}`}>
      <span className="text-sm font-medium text-gray-700">Pozadí prezentace (nepovinné)</span>
      <input
        ref={inputRef}
        type="file"
        accept={IMAGE_ACCEPT_ATTRIBUTE}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onPick(file);
          e.target.value = "";
        }}
      />
      <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-cream px-4 py-3">
        {previewUrl ? (
          // Náhled tak, jak bude na plátně (bez ztlumení).
          <span className="relative block h-16 w-28 shrink-0 overflow-hidden rounded-lg border border-gray-200 bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element -- lokální náhled (blob:) nebo obrázek z Content API */}
            <img src={previewUrl} alt="" className="h-full w-full object-cover" />
          </span>
        ) : null}
        <span className="min-w-0 flex-1 text-xs text-gray-500">
          {previewUrl
            ? image?.kind === "pending"
              ? "Obrázek se nahraje při uložení."
              : "Zobrazí se za všemi slajdy na plátně. Volte spíš světlý, klidný obrázek, ať je text dobře čitelný."
            : "Jeden obrázek za všemi slajdy na plátně (účastníkům na telefonech se nezobrazuje). Zobrazí se bez ztlumení – volte spíš světlý, klidný obrázek."}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={disabled || !imagesEnabled}
            className="rounded-xl border-2 border-gray-200 bg-white px-3 py-1.5 text-sm font-semibold text-gray-700 hover:border-brand hover:text-brand disabled:opacity-50"
          >
            {previewUrl ? "Nahradit" : "+ Vybrat obrázek"}
          </button>
          {previewUrl && (
            <button type="button" onClick={onRemove} disabled={disabled} className="rounded-xl px-3 py-1.5 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50">
              Odebrat
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
