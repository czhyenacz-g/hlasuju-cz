"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type DragEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { LIMITS } from "../../lib/polls/limits.ts";
import { normalizeLinkUrl } from "../../lib/polls/validate.ts";
import { IMAGE_ACCEPT_ATTRIBUTE, prepareImage } from "../../lib/images/prepare-image.ts";
import type { EditorContent, EditorQuestion, QuestionImage } from "../../lib/polls/types.ts";

type OptionDraft = { key: string; id?: number; text: string };
type ImageDraft =
  | { kind: "stored"; url: string; width: number; height: number }
  | { kind: "pending"; blob: Blob; previewUrl: string; width: number; height: number };
type QuestionDraft = {
  key: string;
  id?: number;
  // Zamčená otázka (spuštěná / s hlasy) — v UI jen pro čtení, při
  // uložení se posílá přesně původní obsah (`original`).
  locked: boolean;
  original?: EditorQuestion;
  text: string;
  expanded: boolean;
  options: OptionDraft[];
  // Klíč odpovědi označené jako správná (nepovinné), null = běžná anketa.
  correctKey: string | null;
  image: ImageDraft | null;
  imageAlt: string;
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
  | { mode: "create"; imagesEnabled: boolean }
  | { mode: "edit"; imagesEnabled: boolean; moderatorToken: string; initial: EditorContent; uploadFailed?: boolean };

function makeKey() {
  return Math.random().toString(36).slice(2);
}

function emptyOption(): OptionDraft {
  return { key: makeKey(), text: "" };
}

function emptyQuestion(expanded = true): QuestionDraft {
  return {
    key: makeKey(),
    locked: false,
    text: "",
    expanded,
    options: [emptyOption(), emptyOption()],
    correctKey: null,
    image: null,
    imageAlt: "",
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
    locked: question.locked,
    original: question,
    text: question.text,
    expanded: false,
    options: question.options.map((option) => ({ key: `o${option.id}`, id: option.id, text: option.text })),
    correctKey: question.correctOptionId ? `o${question.correctOptionId}` : null,
    image: question.image ? { kind: "stored", url: question.image.url, width: question.image.width, height: question.image.height } : null,
    imageAlt: question.image?.alt ?? "",
    linkUrl: question.link ? readableUrl(question.link.url) : "",
    linkLabel: question.link?.label ?? "",
    linkShowDuringVoting: question.link?.showDuringVoting ?? false,
    linkOpen: Boolean(question.link),
  };
}

const LETTERS = "ABCDEFGHIJ";

const UPLOAD_ATTEMPTS = 4;

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

/** Návrh otázky → vstup pro PUT /content (zamčené otázky beze změny). */
function toPayloadQuestion(question: QuestionDraft, uploaded: Map<string, { url: string; width: number; height: number }>) {
  if (question.locked && question.original) {
    const { id, text, options, image, link, correctOptionId } = question.original;
    const correctIndex = options.findIndex((option) => option.id === correctOptionId);
    return { id, text, options, image, link, correctOptionIndex: correctIndex === -1 ? null : correctIndex };
  }

  let image: QuestionImage | null = null;
  const alt = question.imageAlt.trim() || null;
  if (question.image?.kind === "stored") {
    image = { url: question.image.url, width: question.image.width, height: question.image.height, alt };
  } else if (question.image?.kind === "pending") {
    const stored = uploaded.get(question.key);
    if (stored) image = { ...stored, alt };
  }

  const correctIndex = question.options.findIndex((option) => option.key === question.correctKey);
  return {
    ...(question.id ? { id: question.id } : {}),
    text: question.text.trim(),
    options: question.options.map((option) => ({ ...(option.id ? { id: option.id } : {}), text: option.text.trim() })),
    image,
    link: question.linkUrl.trim()
      ? { url: question.linkUrl.trim(), label: question.linkLabel.trim() || null, showDuringVoting: question.linkShowDuringVoting }
      : null,
    correctOptionIndex: correctIndex === -1 ? null : correctIndex,
  };
}

// Jeden editor pro vytvoření i úpravu hlasování (žádná duplicitní logika).
// Otázky se skládají lokálně a ukládají se jedním požadavkem; obrázky se
// nahrávají až při uložení (dřív by vznikaly zbytečné osiřelé soubory).
export default function PollEditor(props: PollEditorProps) {
  const router = useRouter();
  const isEdit = props.mode === "edit";
  const [title, setTitle] = useState(isEdit ? props.initial.title ?? "" : "");
  const [email, setEmail] = useState("");
  const [requireParticipantName, setRequireParticipantName] = useState(false);
  const [honeypot, setHoneypot] = useState("");
  const [version, setVersion] = useState(isEdit ? props.initial.version : 1);
  const [questions, setQuestions] = useState<QuestionDraft[]>(() =>
    isEdit ? props.initial.questions.map(draftFromQuestion) : [emptyQuestion()]
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

  function addQuestion() {
    if (questions.length >= LIMITS.MAX_QUESTIONS) return;
    change((prev) => [...prev.map((q) => ({ ...q, expanded: false })), emptyQuestion()]);
  }

  function removeQuestion(key: string) {
    change((prev) => {
      const target = prev.find((q) => q.key === key);
      if (!target || target.locked || prev.length <= 1) return prev;
      if (target.image?.kind === "pending") URL.revokeObjectURL(target.image.previewUrl);
      return prev.filter((q) => q.key !== key);
    });
  }

  function duplicateQuestion(key: string) {
    change((prev) => {
      const index = prev.findIndex((q) => q.key === key);
      if (index === -1 || prev.length >= LIMITS.MAX_QUESTIONS) return prev;
      const source = prev[index];
      const copiedOptions = source.options.map((o) => ({ key: makeKey(), text: o.text }));
      const copy: QuestionDraft = {
        ...emptyQuestion(false),
        text: source.text,
        options: copiedOptions,
        correctKey: copiedOptions[source.options.findIndex((o) => o.key === source.correctKey)]?.key ?? null,
        // Uložený obrázek může sdílet i kopie; nenahraný se musí nahrát znovu.
        image: source.image?.kind === "stored" ? source.image : null,
        imageAlt: source.image?.kind === "stored" ? source.imageAlt : "",
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

  async function pickImage(questionKey: string, file: File) {
    const prepared = await prepareImage(file);
    if (!prepared.ok) {
      setStatus({ kind: "error", message: prepared.error });
      return;
    }
    change((prev) =>
      prev.map((q) => {
        if (q.key !== questionKey || q.locked) return q;
        if (q.image?.kind === "pending") URL.revokeObjectURL(q.image.previewUrl);
        return { ...q, image: { kind: "pending", ...prepared.image } };
      })
    );
  }

  function removeImage(questionKey: string) {
    change((prev) =>
      prev.map((q) => {
        if (q.key !== questionKey || q.locked) return q;
        if (q.image?.kind === "pending") URL.revokeObjectURL(q.image.previewUrl);
        return { ...q, image: null, imageAlt: "" };
      })
    );
  }

  function validateDrafts(): string | null {
    for (const [index, q] of questions.entries()) {
      if (q.locked) continue;
      if (!q.text.trim()) return `Otázka ${index + 1}: doplňte text otázky.`;
      if (q.options.some((o) => !o.text.trim())) return `Otázka ${index + 1}: doplňte text u všech odpovědí.`;
      if (q.linkUrl.trim() && !normalizeLinkUrl(q.linkUrl)) {
        return `Otázka ${index + 1}: odkaz musí být platná adresa (http:// nebo https://).`;
      }
    }
    return null;
  }

  async function uploadPending(moderatorToken: string) {
    const pending = questions.filter((q) => !q.locked && q.image?.kind === "pending");
    const uploaded = new Map<string, { url: string; width: number; height: number }>();
    for (const [index, q] of pending.entries()) {
      if (q.image?.kind !== "pending") continue;
      const progress = `Nahrávám obrázek ${index + 1} z ${pending.length}…`;
      setStatus({ kind: "saving", message: progress });
      uploaded.set(
        q.key,
        await uploadImage(moderatorToken, q.image.blob, (seconds) =>
          setStatus({ kind: "saving", message: `${progress} Úložiště je vytížené, zkouším znovu za ${seconds} s.` })
        )
      );
    }
    return uploaded;
  }

  async function putContent(moderatorToken: string, payloadVersion: number, uploaded: Map<string, { url: string; width: number; height: number }>, idsByKey?: Map<string, number>) {
    const response = await fetch(`/api/polls/moderator/${moderatorToken}/content`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        version: payloadVersion,
        title: title.trim() || undefined,
        questions: questions.map((q) => {
          const payload = toPayloadQuestion(q, uploaded);
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
        requireParticipantName,
        website: honeypot,
        questions: questions.map((q) => {
          const payload = toPayloadQuestion(q, new Map());
          return { text: payload.text, options: payload.options, link: payload.link, correctOptionIndex: payload.correctOptionIndex };
        }),
      }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setStatus({ kind: "error", message: body.error ?? "Hlasování se nepodařilo vytvořit." });
      return;
    }

    const token: string = body.moderatorToken;
    const hasImages = questions.some((q) => q.image?.kind === "pending");
    if (hasImages) {
      try {
        const uploaded = await uploadPending(token);
        const idsByKey = new Map(questions.map((q, index) => [q.key, body.questionIds[index] as number]));
        setStatus({ kind: "saving", message: "Ukládám obrázky k otázkám…" });
        const saved = await putContent(token, 1, uploaded, idsByKey);
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
          ? "Uložením trvale odstraníte 1 otázku. Pokračovat?"
          : `Uložením trvale odstraníte ${removedCount} otázky. Pokračovat?`
      )
    ) {
      return;
    }

    setStatus({ kind: "saving", message: "Ukládám…" });
    const uploaded = await uploadPending(moderatorToken);
    setStatus({ kind: "saving", message: "Ukládám otázky…" });
    const { response, body } = await putContent(moderatorToken, version, uploaded);

    if (!response.ok) {
      if (body.code === "version_conflict" || body.code === "poll_closed") {
        setStatus({ kind: "conflict", message: body.error });
      } else {
        setStatus({ kind: "error", message: body.error ?? "Změny se nepodařilo uložit." });
      }
      return;
    }

    const content = body as EditorContent;
    for (const q of questions) if (q.image?.kind === "pending") URL.revokeObjectURL(q.image.previewUrl);
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
          <span className="text-sm font-medium text-gray-700">Název hlasování (nepovinné)</span>
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
          </label>
        )}
        {!isEdit && (
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
                anonymní. Po vytvoření už nejde změnit. Jména se smažou nejpozději {LIMITS.POLL_TTL_DAYS + 7} dní po vytvoření hlasování.
              </span>
            </span>
          </label>
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
            imagesEnabled={props.imagesEnabled}
            disabled={saving}
            onToggle={() => toggleQuestion(q.key)}
            onChange={(patch) => updateQuestion(q.key, patch)}
            onUpdateOptions={(updater) => updateOptions(q.key, updater)}
            onPickImage={(file) => pickImage(q.key, file)}
            onRemoveImage={() => removeImage(q.key)}
            onDuplicate={() => duplicateQuestion(q.key)}
            onRemove={() => removeQuestion(q.key)}
            onMoveUp={() => moveQuestion(q.key, -1)}
            onMoveDown={() => moveQuestion(q.key, 1)}
          />
        ))}
      </ol>

      <button
        type="button"
        onClick={addQuestion}
        disabled={questions.length >= LIMITS.MAX_QUESTIONS || saving}
        className="rounded-3xl border-2 border-dashed border-brand/30 bg-white/60 px-5 py-4 text-sm font-semibold text-brand transition hover:border-brand hover:bg-brand-light/50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        + Přidat otázku
      </button>

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
              {saving ? "Ukládám…" : isEdit ? "Uložit změny" : "Vytvořit hlasování"}
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
  onPickImage,
  onRemoveImage,
  onDuplicate,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  question: QuestionDraft;
  index: number;
  total: number;
  imagesEnabled: boolean;
  disabled: boolean;
  onToggle: () => void;
  onChange: (patch: Partial<QuestionDraft>) => void;
  onUpdateOptions: (updater: (options: OptionDraft[]) => OptionDraft[]) => void;
  onPickImage: (file: File) => void;
  onRemoveImage: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const previewUrl = question.image?.kind === "pending" ? question.image.previewUrl : question.image?.url;
  const actionClass = "rounded-lg px-2 py-1 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-900 disabled:opacity-30";

  return (
    <li className={`rounded-3xl border shadow-soft ${question.locked ? "border-gray-200 bg-gray-50" : "border-gray-200 bg-white"}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-t-3xl border-b border-gray-100 bg-brand-light/40 px-4 py-3 sm:px-5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-bold text-white">{index + 1}</span>
        <button type="button" onClick={onToggle} className="min-w-0 flex-1 text-left" aria-expanded={question.expanded}>
          <span className="block truncate font-semibold text-gray-900">{question.text.trim() || "Nová otázka"}</span>
          <span className="block text-xs text-gray-500">
            {question.options.length} odpovědi
            {question.image ? " · obrázek" : ""}
            {question.linkUrl.trim() ? " · odkaz" : ""}
          </span>
        </button>
        {question.locked && (
          <span className="rounded-full bg-pastel-blue px-2.5 py-1 text-xs font-semibold text-gray-700" title="Otázka už byla spuštěná — změnit jde jen její pořadí.">
            🔒 Spuštěno – nelze upravit
          </span>
        )}
        <div className="flex flex-wrap items-center gap-1">
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
          <button type="button" onClick={onToggle} className="rounded-lg px-2 py-1 text-sm font-semibold text-brand hover:bg-brand/5">
            {question.expanded ? "Sbalit" : question.locked ? "Zobrazit" : "Upravit"}
          </button>
        </div>
      </div>

      {question.expanded && (
        <div className="flex flex-col gap-5 px-4 py-5 sm:px-5">
          {question.locked ? (
            <LockedQuestionBody question={question} previewUrl={previewUrl} />
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

              <ImageField
                question={question}
                previewUrl={previewUrl}
                imagesEnabled={imagesEnabled}
                disabled={disabled}
                onPick={onPickImage}
                onRemove={onRemoveImage}
                onAltChange={(imageAlt) => onChange({ imageAlt })}
              />

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
              </div>

              <LinkField question={question} onChange={onChange} />
            </>
          )}
        </div>
      )}
    </li>
  );
}

function LockedQuestionBody({ question, previewUrl }: { question: QuestionDraft; previewUrl?: string }) {
  return (
    <div className="flex flex-col gap-3 text-gray-700">
      <p className="text-sm text-gray-500">
        Otázka už byla spuštěná{question.original?.voteCount ? ` a má ${question.original.voteCount} hlasů` : ""}. Aby výsledky zůstaly
        platné, nelze ji měnit ani odstranit — jen přesunout v pořadí.
      </p>
      <p className="font-semibold text-gray-900">{question.text}</p>
      {previewUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- náhled v editoru
        <img src={previewUrl} alt={question.imageAlt || "Obrázek k otázce"} className="max-h-48 w-auto self-start rounded-xl object-contain" />
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
  question,
  previewUrl,
  imagesEnabled,
  disabled,
  onPick,
  onRemove,
  onAltChange,
}: {
  question: QuestionDraft;
  previewUrl?: string;
  imagesEnabled: boolean;
  disabled: boolean;
  onPick: (file: File) => void;
  onRemove: () => void;
  onAltChange: (alt: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file && imagesEnabled && !disabled) onPick(file);
  }

  const fileInput = (
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
  );

  if (question.image && previewUrl) {
    return (
      <div className="flex flex-col gap-3">
        <span className="text-sm font-medium text-gray-700">Obrázek</span>
        <div className="rounded-2xl border border-gray-200 bg-cream p-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- lokální náhled (blob:) nebo obrázek z Content API */}
          <img src={previewUrl} alt={question.imageAlt || "Náhled obrázku"} className="mx-auto max-h-72 w-auto rounded-xl object-contain" />
          {question.image.kind === "pending" && <p className="mt-2 text-center text-xs text-gray-500">Obrázek se nahraje při uložení.</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {fileInput}
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={disabled || !imagesEnabled}
            className="rounded-xl border-2 border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:border-brand hover:text-brand disabled:opacity-50"
          >
            Nahradit obrázek
          </button>
          <button type="button" onClick={onRemove} disabled={disabled} className="rounded-xl px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50">
            Odebrat obrázek
          </button>
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-gray-700">Popis obrázku pro nevidomé (nepovinné)</span>
          <input
            type="text"
            value={question.imageAlt}
            onChange={(e) => onAltChange(e.target.value)}
            maxLength={LIMITS.MAX_IMAGE_ALT_LENGTH}
            placeholder="např. Fotografie poranění předloktí"
            className="rounded-xl border-2 border-gray-200 px-4 py-2.5 text-gray-900 focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/10"
          />
        </label>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-gray-700">Obrázek (nepovinné)</span>
      {fileInput}
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
        className={`flex flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed px-4 py-6 text-center transition disabled:cursor-not-allowed disabled:opacity-50 ${
          dragging ? "border-brand bg-brand-light/60" : "border-brand/25 bg-cream hover:border-brand hover:bg-brand-light/40"
        }`}
      >
        <span className="font-semibold text-brand">+ Přidat obrázek</span>
        <span className="text-xs text-gray-500">Klikněte nebo sem přetáhněte soubor · JPEG, PNG, WebP, GIF (bez animace) · velké fotky se zmenší</span>
      </button>
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
