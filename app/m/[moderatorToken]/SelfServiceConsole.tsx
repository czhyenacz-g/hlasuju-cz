"use client";

import Link from "next/link";
import { useState } from "react";
import QuestionImage from "../../../components/QuestionImage.tsx";
import ResultsBarChart, { votesLabel } from "../../../components/ResultsBarChart.tsx";
import ShareButtons from "../../../components/ShareButtons.tsx";
import type { ModeratorPollView } from "../../../lib/polls/types.ts";

/** Kód pro vložení widgetu — jen veřejný kód, nikdy moderátorský token. */
export function embedCode(origin: string, publicCode: string): string {
  return `<iframe src="${origin}/embed/${publicCode}" width="100%" height="450" style="border:0;max-width:640px" title="Anketa – Hlasuju.cz" loading="lazy"></iframe>`;
}

// Správa veřejné ankety (režim self_service), dokud běží: výsledky,
// sdílení, kód pro web, úprava před prvním hlasem a ukončení. Po ukončení
// přebírá ModeratorFinalSummary (stejně jako u živého hlasování).
export default function SelfServiceConsole({
  poll,
  moderatorToken,
  pending,
  error,
  onEnd,
}: {
  poll: ModeratorPollView;
  moderatorToken: string;
  pending: boolean;
  error: string | null;
  onEnd: () => void;
}) {
  const [showEmbed, setShowEmbed] = useState(false);
  const [copied, setCopied] = useState(false);
  const question = poll.questions[0];
  const origin = typeof window !== "undefined" ? window.location.origin : "https://hlasuju.cz";
  const publicUrl = `${origin}/${poll.publicCode}`;
  const code = embedCode(origin, poll.publicCode);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setShowEmbed(true);
    }
  }

  function end() {
    if (window.confirm("Ukončit anketu? Hlasovat už nepůjde (ani ve vloženém widgetu), výsledky zůstanou vidět. Tuto akci nelze vrátit.")) onEnd();
  }

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-10">
      <p className="text-sm font-semibold uppercase tracking-wide text-brand">Anketa pro web · přijímá hlasy</p>
      <h1 className="mt-1 text-2xl font-bold text-gray-900 sm:text-3xl">{poll.title || question?.text || "Anketa"}</h1>

      <section className="mt-6 rounded-3xl border border-gray-200 bg-white p-5 shadow-soft sm:p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Sdílet odkaz</h2>
        <p className="mt-2 break-all rounded-xl bg-cream px-4 py-3 font-mono text-sm text-gray-800">{publicUrl}</p>
        <div className="mt-3">
          <ShareButtons url={publicUrl} text={question?.text ?? "Anketa"} />
        </div>
        <p className="mt-3 text-xs text-gray-500">Při sdílení na Facebooku se zobrazí náhled s otázkou (bez výsledků a správné odpovědi).</p>

        <div className="mt-6 border-t border-gray-100 pt-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Vložit na web</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setShowEmbed((value) => !value)}
              aria-expanded={showEmbed}
              className="min-h-[44px] rounded-xl border-2 border-gray-200 bg-white px-4 text-sm font-semibold text-gray-800 hover:border-brand hover:text-brand"
            >
              {showEmbed ? "Skrýt kód" : "Vložit na web"}
            </button>
            {showEmbed && (
              <button type="button" onClick={copyCode} className="min-h-[44px] rounded-xl bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-dark">
                {copied ? "Zkopírováno ✓" : "Kopírovat kód"}
              </button>
            )}
          </div>
          {showEmbed && (
            <>
              <textarea
                readOnly
                value={code}
                rows={3}
                onFocus={(e) => e.currentTarget.select()}
                aria-label="Kód pro vložení ankety na web"
                className="mt-3 w-full rounded-xl border-2 border-gray-200 bg-cream p-3 font-mono text-xs text-gray-800"
              />
              <p className="mt-1 text-xs text-gray-500">
                Vložte do HTML stránky (v WordPressu blok „Vlastní HTML“). Výšku můžete upravit; delší obsah se ve widgetu posune.
              </p>
            </>
          )}
        </div>
      </section>

      {question && (
        <section className="mt-6 rounded-3xl border border-gray-200 bg-white p-5 shadow-soft sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h2 className="text-xl font-bold text-gray-900">{question.text}</h2>
            {question.totalVotes === 0 && (
              <Link
                href={`/m/${moderatorToken}/upravit`}
                className="rounded-xl border-2 border-gray-200 px-4 py-2 text-sm font-semibold text-gray-800 hover:border-brand hover:text-brand"
              >
                ✎ Upravit
              </Link>
            )}
          </div>
          {question.image && (
            <div className="mt-3">
              <QuestionImage image={question.image} maxHeightClass="max-h-56" />
            </div>
          )}
          <div className="mt-4">
            <ResultsBarChart options={question.options} totalVotes={question.totalVotes} correctOptionId={question.correctOptionId} />
          </div>
          <p className="mt-2 text-sm text-gray-500">
            {question.totalVotes} {votesLabel(question.totalVotes)} · výsledky se obnovují samy
            {question.correctOptionId !== null && " · správnou odpověď uvidí hlasující až po ukončení ankety"}
          </p>
          {question.totalVotes > 0 && <p className="mt-1 text-xs text-gray-500">Po prvním hlasu už otázku ani odpovědi nejde měnit.</p>}
        </section>
      )}

      {error && <p className="mt-4 text-sm text-red-700">{error}</p>}

      <button
        type="button"
        onClick={end}
        disabled={pending}
        className="mt-6 min-h-[52px] w-full rounded-2xl bg-brand px-6 text-base font-semibold text-white shadow-soft hover:bg-brand-dark disabled:opacity-60"
      >
        Ukončit anketu a zobrazit souhrn
      </button>
      <p className="mt-2 text-center text-xs text-gray-500">
        Anketa přijímá hlasy, dokud ji neukončíte. Platí 30 dní od posledního hlasu. Ochrana proti opakovanému hlasování je jednoduchá
        (zařízení/prohlížeč a limit na připojení) — výsledky berte jako orientační.
      </p>
    </main>
  );
}
