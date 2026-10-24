"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { usePolling } from "../../../lib/use-polling.ts";
import QrCode from "../../../components/QrCode.tsx";
import QuestionImage from "../../../components/QuestionImage.tsx";
import QuestionLink from "../../../components/QuestionLink.tsx";
import AlphegaAffiliateBanner from "../../../components/AlphegaAffiliateBanner.tsx";
import PresentationView from "./PresentationView.tsx";
import ModeratorFinalSummary from "./ModeratorFinalSummary.tsx";
import { PrimaryQuestionAction, QuestionStatusBadge, type ModeratorAction } from "./QuestionControls.tsx";
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
  return (poll.questions.find((q) => q.status === "prepared") ?? poll.questions[0])?.id ?? null;
}

// Kurzor (vybraná otázka) je lokální stav moderátora — mění to, co
// moderátor vidí a co "Spustit otázku" spustí, NIKDY samo o sobě to, co
// vidí účastníci (to mění jen akce na serveru). Kurzor je podle ID
// otázky, ne indexu, aby přežil editaci/přeřazení otázek.
export default function ModeratorConsole({ moderatorToken }: { moderatorToken: string }) {
  const [cursorId, setCursorId] = useState<number | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [presenting, setPresenting] = useState(false);
  const [copyLabel, setCopyLabel] = useState("Kopírovat odkaz");
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState(false);

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
      void runAction("end");
    }
  }

  // Po poslední otázce (nebo když už nic nečeká na spuštění) nabídnout výrazné ukončení.
  const nothingLeft = poll.questions.length > 0 && poll.questions.every((q) => q.status !== "prepared");
  const onLastQuestion = cursorIndex === poll.questions.length - 1 && question?.status !== "prepared";

  if (poll.pollStatus === "closed") {
    return (
      <ModeratorFinalSummary
        poll={poll}
        moderatorToken={moderatorToken}
        onEmailSent={refresh}
        onCopyLink={copyLink}
        copyLabel={copyLabel === "Kopírovat odkaz" ? "Kopírovat odkaz na výsledky" : copyLabel}
      />
    );
  }

  if (presenting && question) {
    return (
      <PresentationView
        poll={poll}
        question={question}
        questionIndex={cursorIndex}
        publicUrl={publicUrl}
        pending={actionPending}
        error={actionError}
        onSelect={(id) => setCursorId(id)}
        onAction={runAction}
        onClose={() => setPresenting(false)}
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
            ✎ Upravit otázky
          </Link>
          <button
            type="button"
            onClick={() => setPresenting(true)}
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
            question.status === "active" ? "border-brand ring-4 ring-brand/15" : "border-gray-200"
          }`}
        >
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-gray-500">
              Otázka {cursorIndex + 1} z {poll.questions.length}
            </p>
            <QuestionStatusBadge question={question} isCurrent={question.id === poll.activeQuestionId} />
          </div>
          <h2 className="mt-2 text-xl font-bold text-gray-900">{question.text}</h2>

          {question.image && (
            <div className="mt-4">
              <QuestionImage image={question.image} maxHeightClass="max-h-64" />
            </div>
          )}

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
            <PrimaryQuestionAction question={question} pending={actionPending} onAction={runAction} />
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
              onClick={() => setPresenting(true)}
              className="rounded-xl border-2 border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:border-brand hover:text-brand"
            >
              Promítnout otázku a výsledky
            </button>
          </div>

          {actionError && <p className="mt-3 text-sm text-red-600">{actionError}</p>}
        </section>
      )}

      <section className="mt-6 rounded-3xl border border-gray-200 bg-white p-4 shadow-soft sm:p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Všechny otázky</h2>
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
                <span className="min-w-0 flex-1 truncate">{q.text}</span>
                {q.image && <span title="Má obrázek">🖼</span>}
                <QuestionStatusBadge question={q} isCurrent={q.id === poll.activeQuestionId} compact />
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
