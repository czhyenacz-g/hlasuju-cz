"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePolling } from "../../../lib/use-polling.ts";
import QrCode from "../../../components/QrCode.tsx";
import { QuestionImages } from "../../../components/QuestionImage.tsx";
import QuestionLink from "../../../components/QuestionLink.tsx";
import SlideBody from "../../../components/SlideBody.tsx";
import AlphegaAffiliateBanner from "../../../components/AlphegaAffiliateBanner.tsx";
import PresentationView from "./PresentationView.tsx";
import ModeratorFinalSummary from "./ModeratorFinalSummary.tsx";
import SelfServiceConsole from "./SelfServiceConsole.tsx";
import { PrimaryQuestionAction, QuestionStatusBadge, type ModeratorAction } from "./QuestionControls.tsx";
import { SLIDE_KIND_BADGE, SLIDE_KIND_ICON, SLIDE_KIND_LABEL, slideTitle } from "../../../lib/polls/slide-labels.ts";
import type { ModeratorPollView } from "../../../lib/polls/types.ts";

const LETTERS = "ABCDEFGHIJ";

const ACTION_URL: Record<ModeratorAction, string> = {
  activate: "activate",
  close: "close-question",
  end: "end",
};

/** Kterou otázku ukázat po (re)loadu: běžící/vyhodnocovanou, jinak první nespuštěnou. */
function initialCursor(poll: ModeratorPollView): number | null {
  if (poll.activeQuestionId && poll.questions.some((q) => q.id === poll.activeQuestionId)) return poll.activeQuestionId;
  return (poll.questions.find((q) => q.kind === "question" && q.status === "prepared") ?? poll.questions[0])?.id ?? null;
}

// Promítání přežije obnovení stránky (stav běhu je na serveru, tady jen
// to, jestli byl prezentující v promítacím režimu).
function presentingKey(moderatorToken: string) {
  return `hlasuju_presenting_${moderatorToken.slice(0, 16)}`;
}

function readPresenting(moderatorToken: string): boolean {
  try {
    return window.sessionStorage.getItem(presentingKey(moderatorToken)) === "1";
  } catch {
    return false;
  }
}

function storePresenting(moderatorToken: string, value: boolean) {
  try {
    if (value) window.sessionStorage.setItem(presentingKey(moderatorToken), "1");
    else window.sessionStorage.removeItem(presentingKey(moderatorToken));
  } catch {
    // Bez sessionStorage se po reloadu jen ukáže řídicí konzole.
  }
}

// Kurzor (vybraný slajd) je lokální stav moderátora v řídicí konzoli —
// mění to, co moderátor vidí a co "Spustit otázku" spustí, NIKDY samo o
// sobě to, co vidí účastníci. V promítání je naopak zdrojem pravdy server
// (active_question_id): „Další“/„Zpět“ přepínají slajd pro všechny
// (lib/polls/navigate-slide.ts). Kurzor je podle ID, ne indexu, aby
// přežil editaci/přeřazení.
export default function ModeratorConsole({ moderatorToken }: { moderatorToken: string }) {
  const router = useRouter();
  const [cursorId, setCursorId] = useState<number | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [presenting, setPresentingState] = useState(false);
  const [copyLabel, setCopyLabel] = useState("Kopírovat odkaz");
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState(false);
  // Cílový slajd, než ho potvrdí server (okamžitá odezva „Další“).
  const [optimisticSlideId, setOptimisticSlideId] = useState<number | null>(null);
  const navigatingRef = useRef(false);

  useEffect(() => {
    setPresentingState(readPresenting(moderatorToken));
  }, [moderatorToken]);

  const setPresenting = useCallback(
    (value: boolean) => {
      setPresentingState(value);
      storePresenting(moderatorToken, value);
    },
    [moderatorToken]
  );

  const fetcher = useCallback(
    async (signal: AbortSignal) => {
      const response = await fetch(`/api/polls/moderator/${moderatorToken}`, { signal, cache: "no-store" });
      if (response.status === 404) return { notFound: true as const };
      if (!response.ok) throw new Error("Nepodařilo se načíst hlasování.");
      const data: ModeratorPollView = await response.json();
      return { notFound: false as const, poll: data };
    },
    [moderatorToken]
  );

  const { data, error, refresh } = usePolling(fetcher);
  const poll = data && !data.notFound ? data.poll : null;

  // Po reloadu stránky obnovit aktuálně běžící otázku (dřív začínal
  // kurzor vždy na otázce 1). Když vybraná otázka zmizí (editace), vybrat znovu.
  useEffect(() => {
    if (!poll) return;
    if (cursorId === null || !poll.questions.some((q) => q.id === cursorId)) setCursorId(initialCursor(poll));
  }, [poll, cursorId]);

  // Server potvrdil přechod → optimistický cíl už není potřeba.
  useEffect(() => {
    if (poll && optimisticSlideId !== null && poll.activeQuestionId === optimisticSlideId) setOptimisticSlideId(null);
  }, [poll, optimisticSlideId]);

  // Slajd, na který server naposledy potvrdil přechod, dokud ho nedožene
  // i polling — jinak by rychlé „Další“ hned po přechodu poslalo zastaralé
  // fromSlideId a server by ho odmítl jako „stale“.
  const confirmedSlideRef = useRef<number | null>(null);
  useEffect(() => {
    if (poll && poll.activeQuestionId === confirmedSlideRef.current) confirmedSlideRef.current = null;
  }, [poll]);

  const runAction = useCallback(
    async (action: ModeratorAction, questionId?: number) => {
      setActionError(null);
      setActionPending(true);
      try {
        const response = await fetch(`/api/polls/moderator/${moderatorToken}/${ACTION_URL[action]}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: action === "end" ? undefined : JSON.stringify({ questionId }),
        });
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          setActionError(body.error ?? "Akce se nezdařila.");
        }
      } catch {
        setActionError("Akce se nezdařila. Zkuste to prosím znovu.");
      } finally {
        setActionPending(false);
        refresh();
      }
    },
    [moderatorToken, refresh]
  );

  const pollRef = useRef(poll);
  pollRef.current = poll;

  /** Přechod na slajd pro všechny (uzavře/otevře odpovídání na serveru). */
  const navigateTo = useCallback(
    async (toSlideId: number) => {
      const current = pollRef.current;
      // Dvojklik / držená klávesa: další přechod až po dokončení předchozího.
      if (!current || navigatingRef.current) return;
      navigatingRef.current = true;
      setActionError(null);
      setActionPending(true);
      setOptimisticSlideId(toSlideId);
      setCursorId(toSlideId);
      try {
        const response = await fetch(`/api/polls/moderator/${moderatorToken}/navigate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fromSlideId: confirmedSlideRef.current ?? current.activeQuestionId, toSlideId }),
        });
        confirmedSlideRef.current = null;
        if (response.ok) {
          const body = await response.json().catch(() => ({}));
          if (typeof body.activeSlideId === "number") confirmedSlideRef.current = body.activeSlideId;
        } else {
          const body = await response.json().catch(() => ({}));
          setOptimisticSlideId(null);
          setActionError(body.error ?? "Přechod se nezdařil.");
        }
      } catch {
        setOptimisticSlideId(null);
        setActionError("Přechod se nezdařil. Zkontrolujte připojení a zkuste to znovu.");
      } finally {
        navigatingRef.current = false;
        setActionPending(false);
        refresh();
      }
    },
    [moderatorToken, refresh]
  );

  const closePresentation = useCallback(() => setPresenting(false), [setPresenting]);

  /** Spustí promítání; když se zatím nic nepromítá, zobrazí první (nebo vybraný) slajd. */
  function startPresenting(fromSlideId?: number) {
    if (!poll) return;
    setPresenting(true);
    const activeExists = poll.activeQuestionId !== null && poll.questions.some((q) => q.id === poll.activeQuestionId);
    const target = fromSlideId ?? (activeExists ? null : poll.questions[0]?.id);
    if (target && target !== poll.activeQuestionId) void navigateTo(target);
  }

  const [duplicating, setDuplicating] = useState(false);
  async function startNewRun() {
    if (
      !window.confirm(
        "Vytvořit nové promítání stejné prezentace pro jiné publikum?\n\nVznikne nový kód pro účastníky a nový odkaz na řízení. Odpovědi a body začnou od nuly; toto promítání zůstane beze změny i s výsledky."
      )
    ) {
      return;
    }
    setDuplicating(true);
    setActionError(null);
    try {
      const response = await fetch(`/api/polls/moderator/${moderatorToken}/duplicate`, { method: "POST" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Nové promítání se nepodařilo vytvořit.");
      storePresenting(moderatorToken, false);
      router.push(`/m/${body.moderatorToken}`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Nové promítání se nepodařilo vytvořit.");
      setDuplicating(false);
    }
  }

  const [resetting, setResetting] = useState(false);
  async function resetPresentation() {
    if (
      !window.confirm(
        "Začít prezentaci znovu od začátku?\n\nSmažou se všechny odpovědi, body i jména účastníků a všechny otázky se vrátí do stavu před spuštěním — jako by se prezentace nikdy nepřehrávala. Obsah slajdů, kód pro účastníky i tento odkaz zůstanou stejné.\n\nTuto akci nelze vrátit."
      )
    ) {
      return;
    }
    setResetting(true);
    setActionError(null);
    try {
      const response = await fetch(`/api/polls/moderator/${moderatorToken}/reset`, { method: "POST" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Prezentaci se nepodařilo vynulovat.");
      setPresenting(false);
      setOptimisticSlideId(null);
      confirmedSlideRef.current = null;
      setCursorId(null);
      refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Prezentaci se nepodařilo vynulovat.");
    } finally {
      setResetting(false);
    }
  }

  if (data?.notFound) {
    return <StateScreen title="Hlasování nenalezeno" message="Odkaz je neplatný, nebo hlasování vypršelo." />;
  }

  if (!data && !error) {
    return <StateScreen title="Načítám…" message="Chvilku strpení." />;
  }

  if (!poll) {
    return <StateScreen title="Chyba" message={error ?? "Něco se nepovedlo."} />;
  }

  const publicUrl = typeof window !== "undefined" ? `${window.location.origin}/${poll.publicCode}` : `/${poll.publicCode}`;
  const cursorIndex = Math.max(0, poll.questions.findIndex((q) => q.id === cursorId));
  const question = poll.questions[cursorIndex] ?? null;
  const questionSlides = poll.questions.filter((q) => q.kind === "question");

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopyLabel("Zkopírováno ✓");
      setTimeout(() => setCopyLabel("Kopírovat odkaz"), 1500);
    } catch {
      setCopyLabel("Nepodařilo se zkopírovat");
      setTimeout(() => setCopyLabel("Kopírovat odkaz"), 1500);
    }
  }

  function endWholePoll() {
    const stillActive = poll?.questions.some((q) => q.status === "active");
    if (
      window.confirm(
        (stillActive ? "Některá otázka je ještě otevřená pro hlasování — ukončením se uzavře. " : "") +
          "Ukončit celé hlasování? Účastníci uvidí finální výsledky. Tuto akci nelze vrátit — hlasovat ani upravovat otázky už pak nepůjde."
      )
    ) {
      setPresenting(false);
      void runAction("end");
    }
  }

  // Po poslední otázce (nebo když už nic nečeká na spuštění) nabídnout výrazné ukončení.
  const nothingLeft = questionSlides.length > 0 && questionSlides.every((q) => q.status !== "prepared");
  const onLastQuestion = cursorIndex === poll.questions.length - 1 && question?.status !== "prepared";

  if (poll.pollStatus === "closed") {
    return (
      <ModeratorFinalSummary
        poll={poll}
        moderatorToken={moderatorToken}
        onEmailSent={refresh}
        onCopyLink={copyLink}
        copyLabel={copyLabel === "Kopírovat odkaz" ? "Kopírovat odkaz na výsledky" : copyLabel}
        onNewRun={startNewRun}
        newRunPending={duplicating}
        newRunError={actionError}
        onReset={resetPresentation}
        resetPending={resetting}
      />
    );
  }

  if (poll.mode === "self_service") {
    return <SelfServiceConsole poll={poll} moderatorToken={moderatorToken} pending={actionPending} error={actionError} onEnd={() => void runAction("end")} />;
  }

  // Promítá se to, co je aktivní na serveru (po přechodu hned cílový slajd).
  const shownId = optimisticSlideId ?? poll.activeQuestionId;
  const shownIndex = poll.questions.findIndex((q) => q.id === shownId);
  const presentedIndex = shownIndex === -1 ? 0 : shownIndex;
  const presented = poll.questions[presentedIndex];

  if (presenting && presented) {
    return (
      <PresentationView
        poll={poll}
        slide={presented}
        slideIndex={presentedIndex}
        publicUrl={publicUrl}
        pending={actionPending}
        error={actionError}
        onNavigate={navigateTo}
        onAction={runAction}
        onClose={closePresentation}
      />
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">{poll.title || "Hlasování připraveno"}</h1>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/m/${moderatorToken}/upravit`}
            className="rounded-xl border-2 border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-800 hover:border-brand hover:text-brand"
          >
            ✎ Upravit prezentaci
          </Link>
          {(poll.activeQuestionId !== null || poll.questions.some((q) => q.status !== "prepared")) && (
            <button
              type="button"
              onClick={resetPresentation}
              disabled={resetting}
              title="Smaže odpovědi, body i jména a vrátí prezentaci do stavu před prvním spuštěním"
              className="rounded-xl border-2 border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-800 hover:border-red-300 hover:text-red-700 disabled:opacity-60"
            >
              {resetting ? "Nuluji…" : "↺ Znovu od začátku"}
            </button>
          )}
          <button
            type="button"
            onClick={() => startPresenting()}
            disabled={!question}
            className="rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-700 disabled:opacity-50"
          >
            ▶ Promítat
          </button>
        </div>
      </div>

      <section className="mt-6 rounded-3xl border border-gray-200 bg-white p-6 text-center shadow-soft">
        <p className="text-sm font-medium text-gray-500">Kód pro účastníky</p>
        <p className="mx-auto mt-2 inline-block rounded-2xl bg-brand-light px-6 py-2 text-5xl font-bold tracking-widest text-brand-dark">{poll.publicCode}</p>
        <p className="mt-2 text-gray-500">hlasuju.cz/{poll.publicCode}</p>
        {poll.registeredParticipants !== null && (
          <p className="mt-2 font-semibold text-gray-700">👥 Přihlášeno: {poll.registeredParticipants}</p>
        )}

        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={copyLink}
            className="rounded-xl border-2 border-gray-200 px-5 py-2.5 text-sm font-semibold text-gray-800 hover:border-brand hover:text-brand"
          >
            {copyLabel}
          </button>
          <button
            type="button"
            onClick={() => setShowQr((v) => !v)}
            className="rounded-xl border-2 border-gray-200 px-5 py-2.5 text-sm font-semibold text-gray-800 hover:border-brand hover:text-brand"
          >
            {showQr ? "Skrýt QR" : "Zobrazit QR"}
          </button>
        </div>

        {showQr && (
          <div className="mt-5 flex justify-center">
            <QrCode value={publicUrl} />
          </div>
        )}
      </section>

      {question && (
        <section
          className={`mt-6 rounded-3xl border bg-white p-6 shadow-soft ${
            question.status === "active" || question.id === poll.activeQuestionId ? "border-brand ring-4 ring-brand/15" : "border-gray-200"
          }`}
        >
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-gray-500">
              Slajd {cursorIndex + 1} z {poll.questions.length}
            </p>
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${SLIDE_KIND_BADGE[question.kind]}`}>{SLIDE_KIND_LABEL[question.kind]}</span>
            {question.kind === "question" ? (
              <QuestionStatusBadge question={question} isCurrent={question.id === poll.activeQuestionId} />
            ) : (
              question.id === poll.activeQuestionId && <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800">● Promítá se</span>
            )}
          </div>
          <h2 className="mt-2 text-xl font-bold text-gray-900">{slideTitle(question, poll.questions)}</h2>

          {question.images.length > 0 && (
            <div className="mt-4">
              <QuestionImages images={question.images} maxHeightClass="max-h-64" />
            </div>
          )}

          {question.kind === "content" && question.body && <SlideBody text={question.body} className="mt-3 text-gray-700" />}
          {question.kind === "leaderboard" && question.leaderboard && (
            <p className="mt-2 text-sm text-gray-600">
              {question.leaderboard.scoredQuestionsTotal === 0
                ? "Před tímto slajdem není žádná bodovaná otázka."
                : `Uzavřené bodované otázky: ${question.leaderboard.scoredQuestions} z ${question.leaderboard.scoredQuestionsTotal} · účastníků: ${question.leaderboard.entries.length}`}
            </p>
          )}

          {question.kind === "question" && (
            <ul className="mt-4 flex flex-col gap-1.5 text-gray-800">
              {question.options.map((option, index) => (
                <li key={option.id} className="flex items-baseline gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center self-center rounded-md bg-brand-light text-sm font-bold text-brand-dark">{LETTERS[index]}</span>
                  <span className="flex-1">
                    {option.text}
                    {/* Jen pro moderátora — účastníci a plátno ji uvidí až po ukončení otázky. */}
                    {option.id === question.correctOptionId && <span className="ml-2 text-sm font-semibold text-emerald-700">✓ správná</span>}
                  </span>
                  {question.status !== "prepared" && <span className="text-sm text-gray-500">{option.votes}</span>}
                </li>
              ))}
            </ul>
          )}

          {question.link && (
            <div className="mt-4">
              <QuestionLink link={question.link} />
              <p className="mt-1 text-xs text-gray-500">
                {question.link.showDuringVoting ? "Studenti odkaz vidí už během hlasování." : "Studentům se odkaz ukáže až po ukončení otázky."}
              </p>
            </div>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setCursorId(poll.questions[cursorIndex - 1]?.id ?? question.id)}
              disabled={cursorIndex === 0}
              className="rounded-xl border-2 border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-700 disabled:opacity-30"
            >
              ← Předchozí
            </button>
            {question.kind === "question" && <PrimaryQuestionAction question={question} pending={actionPending} onAction={runAction} />}
            <button
              type="button"
              onClick={() => setCursorId(poll.questions[cursorIndex + 1]?.id ?? question.id)}
              disabled={cursorIndex === poll.questions.length - 1}
              className="rounded-xl border-2 border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-700 disabled:opacity-30"
            >
              Další →
            </button>
            <button
              type="button"
              onClick={() => startPresenting(question.id)}
              className="rounded-xl border-2 border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:border-brand hover:text-brand"
              title="Promítne tento slajd účastníkům i na plátno (otázka se otevře)"
            >
              Promítat od tohoto slajdu
            </button>
          </div>

          {actionError && <p className="mt-3 text-sm text-red-600">{actionError}</p>}
        </section>
      )}

      <section className="mt-6 rounded-3xl border border-gray-200 bg-white p-4 shadow-soft sm:p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Všechny slajdy</h2>
        <ol className="mt-3 flex flex-col gap-1">
          {poll.questions.map((q, index) => (
            <li key={q.id}>
              <button
                type="button"
                onClick={() => setCursorId(q.id)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition ${
                  q.id === question?.id ? "bg-brand-light text-gray-900" : "text-gray-700 hover:bg-gray-100"
                }`}
              >
                <span className="w-6 shrink-0 text-gray-400">{index + 1}.</span>
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-bold ${SLIDE_KIND_BADGE[q.kind]}`}
                  title={SLIDE_KIND_LABEL[q.kind]}
                  aria-label={SLIDE_KIND_LABEL[q.kind]}
                >
                  {SLIDE_KIND_ICON[q.kind]}
                </span>
                <span className="min-w-0 flex-1 truncate">{slideTitle(q, poll.questions)}</span>
                {q.images.length > 0 && <span title="Má obrázek">🖼</span>}
                {q.kind === "question" ? (
                  <QuestionStatusBadge question={q} isCurrent={q.id === poll.activeQuestionId} compact />
                ) : (
                  q.id === poll.activeQuestionId && <span className="shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800">● Promítá se</span>
                )}
              </button>
            </li>
          ))}
        </ol>
      </section>

      {nothingLeft || onLastQuestion ? (
        <button
          type="button"
          onClick={endWholePoll}
          disabled={actionPending}
          className="mt-6 min-h-[52px] w-full rounded-2xl bg-brand px-6 text-base font-semibold text-white shadow-soft transition hover:bg-brand-dark focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/30 disabled:opacity-60"
        >
          Ukončit hlasování a zobrazit souhrn
        </button>
      ) : (
        <div className="mt-6 flex justify-end">
          <button type="button" onClick={endWholePoll} disabled={actionPending} className="text-sm font-semibold text-red-600 hover:underline disabled:opacity-60">
            Ukončit celé hlasování…
          </button>
        </div>
      )}

      <div className="mt-4 flex justify-end">
        <button type="button" onClick={startNewRun} disabled={duplicating} className="text-sm font-semibold text-gray-600 hover:text-brand hover:underline disabled:opacity-60">
          {duplicating ? "Vytvářím…" : "Nové promítání pro jiné publikum…"}
        </button>
      </div>

      {/* compact, vždy pod řízením hlasování — moderátor tuhle obrazovku
          typicky sdílí na projektoru, banner nesmí být sticky/nápadný. */}
      <div className="mt-6">
        <AlphegaAffiliateBanner variant="compact" />
      </div>
    </main>
  );
}

function StateScreen({ title, message }: { title: string; message: string }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-10 text-center">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
        <p className="mt-3 text-gray-600">{message}</p>
      </div>
    </main>
  );
}
