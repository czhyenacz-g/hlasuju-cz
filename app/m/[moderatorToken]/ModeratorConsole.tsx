"use client";

import { useCallback, useState } from "react";
import { usePolling } from "../../../lib/use-polling.ts";
import QrCode from "../../../components/QrCode.tsx";
import ResultsBarChart from "../../../components/ResultsBarChart.tsx";
import AdSlot from "../../../components/AdSlot.tsx";
import type { ModeratorPollView } from "../../../lib/polls/types.ts";

// Prev/Next je čistě lokální kurzor pro procházení/výběr otázky
// moderátorem — mění to, co moderátor vidí a co "SPUSTIT OTÁZKU" spustí,
// NIKDY samo o sobě to, co vidí účastníci (to mění jen activate call).
export default function ModeratorConsole({ moderatorToken }: { moderatorToken: string }) {
  const [cursor, setCursor] = useState(0);
  const [showQr, setShowQr] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [copyLabel, setCopyLabel] = useState("Kopírovat odkaz");
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState(false);

  const fetcher = useCallback(
    async (signal: AbortSignal) => {
      const response = await fetch(`/api/polls/moderator/${moderatorToken}`, { signal });
      if (response.status === 404) return { notFound: true as const };
      if (!response.ok) throw new Error("Nepodařilo se načíst hlasování.");
      const data: ModeratorPollView = await response.json();
      return { notFound: false as const, poll: data };
    },
    [moderatorToken]
  );

  const { data, error } = usePolling(fetcher);

  if (data?.notFound) {
    return (
      <StateScreen title="Hlasování nenalezeno" message="Odkaz je neplatný, nebo hlasování vypršelo." />
    );
  }

  if (!data && !error) {
    return <StateScreen title="Načítám…" message="Chvilku strpení." />;
  }

  if (!data || data.notFound) {
    return <StateScreen title="Chyba" message={error ?? "Něco se nepovedlo."} />;
  }

  const { poll } = data;
  const publicUrl = typeof window !== "undefined" ? `${window.location.origin}/${poll.publicCode}` : `/${poll.publicCode}`;
  const question = poll.questions[cursor] ?? null;
  const isActive = question ? question.id === poll.activeQuestionId : false;

  async function runAction(action: "activate" | "end") {
    setActionError(null);
    setActionPending(true);
    try {
      const url =
        action === "activate"
          ? `/api/polls/moderator/${moderatorToken}/activate`
          : `/api/polls/moderator/${moderatorToken}/end`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: action === "activate" ? JSON.stringify({ questionId: question?.id }) : undefined,
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setActionError(body.error ?? "Akce se nezdařila.");
      }
    } catch {
      setActionError("Akce se nezdařila. Zkuste to prosím znovu.");
    } finally {
      setActionPending(false);
    }
  }

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

  if (showResults && question) {
    return (
      <main className="mx-auto min-h-screen max-w-2xl px-4 py-10">
        <button type="button" onClick={() => setShowResults(false)} className="text-sm text-gray-500 hover:underline">
          ← Zpět na řízení
        </button>
        <p className="mt-4 text-sm font-medium text-gray-500">
          Celkem hlasů: <span className="font-semibold text-gray-900">{question.totalVotes}</span>
        </p>
        <h1 className="mt-2 text-3xl font-bold text-gray-900 sm:text-4xl">{question.text}</h1>
        <div className="mt-10">
          <ResultsBarChart options={question.options} totalVotes={question.totalVotes} />
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-bold text-gray-900">{poll.title || "Hlasování připraveno"}</h1>

      <section className="mt-6 rounded-3xl border border-gray-200 bg-white p-6 text-center shadow-sm">
        <p className="text-sm font-medium text-gray-500">Kód pro účastníky</p>
        <p className="mt-1 text-5xl font-bold tracking-widest text-brand">{poll.publicCode}</p>
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

      {poll.pollStatus === "closed" ? (
        <section className="mt-6 rounded-3xl border border-gray-200 bg-white p-6 text-center">
          <p className="font-semibold text-gray-900">Hlasování bylo ukončeno.</p>
          <button
            type="button"
            onClick={() => setShowResults(true)}
            className="mt-4 rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-white hover:bg-brand-dark"
          >
            Zobrazit výsledky
          </button>
        </section>
      ) : (
        question && (
          <section className="mt-6 rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-medium text-gray-500">
              Otázka {cursor + 1} z {poll.questions.length}
              {isActive && <span className="ml-2 rounded-full bg-brand/10 px-2 py-0.5 text-xs font-semibold text-brand">SPUŠTĚNO</span>}
            </p>
            <h2 className="mt-2 text-xl font-bold text-gray-900">{question.text}</h2>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setCursor((c) => Math.max(0, c - 1))}
                disabled={cursor === 0}
                className="rounded-xl border-2 border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-700 disabled:opacity-30"
              >
                ← Předchozí
              </button>
              <button
                type="button"
                onClick={() => runAction("activate")}
                disabled={actionPending || isActive}
                className="rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
              >
                Spustit otázku
              </button>
              <button
                type="button"
                onClick={() => setCursor((c) => Math.min(poll.questions.length - 1, c + 1))}
                disabled={cursor === poll.questions.length - 1}
                className="rounded-xl border-2 border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-700 disabled:opacity-30"
              >
                Další →
              </button>
              <button
                type="button"
                onClick={() => setShowResults(true)}
                className="rounded-xl border-2 border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:border-brand hover:text-brand"
              >
                Výsledky
              </button>
            </div>

            {poll.activeQuestionId !== null && (
              <button
                type="button"
                onClick={() => runAction("end")}
                disabled={actionPending}
                className="mt-4 text-sm font-semibold text-red-600 hover:underline disabled:opacity-60"
              >
                Ukončit hlasování
              </button>
            )}

            {actionError && <p className="mt-3 text-sm text-red-600">{actionError}</p>}
          </section>
        )
      )}

      <div className="mt-10">
        <AdSlot label="Reklamní plocha — moderátor" />
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
