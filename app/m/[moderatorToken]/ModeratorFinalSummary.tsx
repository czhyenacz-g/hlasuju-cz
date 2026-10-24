"use client";

import { useEffect, useState } from "react";
import QuestionImage from "../../../components/QuestionImage.tsx";
import QuestionLink from "../../../components/QuestionLink.tsx";
import ResultsBarChart, { votesLabel } from "../../../components/ResultsBarChart.tsx";
import AlphegaAffiliateBanner from "../../../components/AlphegaAffiliateBanner.tsx";
import ResultsEmailButton from "./ResultsEmailButton.tsx";
import { overallSuccess, questionSuccess } from "../../../lib/polls/stats.ts";
import type { ModeratorPollView, ModeratorQuestionView, QuestionResponsesPage } from "../../../lib/polls/types.ts";

// Závěrečná obrazovka moderátora po ukončení hlasování: souhrn hned,
// podrobné výsledky po kliknutí, individuální odpovědi až na vyžádání
// u konkrétní otázky (nic dalšího se nepolluje ani nepřenáší předem).
export default function ModeratorFinalSummary({
  poll,
  moderatorToken,
  onEmailSent,
  onCopyLink,
  copyLabel,
}: {
  poll: ModeratorPollView;
  moderatorToken: string;
  onEmailSent: () => void;
  onCopyLink: () => void;
  copyLabel: string;
}) {
  const [showDetails, setShowDetails] = useState(false);
  const launched = poll.questions.filter((question) => question.status !== "prepared");
  const notLaunched = poll.questions.length - launched.length;
  const success = overallSuccess(launched);

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-10">
      <p className="text-sm font-semibold uppercase tracking-wide text-brand">Hlasování ukončeno</p>
      <h1 className="mt-1 text-3xl font-bold text-gray-900">{poll.title || "Výsledky hlasování"}</h1>
      <p className="mt-1 text-sm text-gray-500">
        hlasuju.cz/{poll.publicCode} · {poll.requireParticipantName ? "jmenovité hlasování" : "anonymní hlasování"}
      </p>

      <dl className={`mt-6 grid grid-cols-2 gap-3 ${success ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}>
        <Stat label="Otázek" value={String(launched.length)} />
        <Stat label="Účastníků" value={String(poll.uniqueParticipants)} />
        <Stat label="Hlasů celkem" value={String(poll.totalVotes)} />
        {success && <Stat label="Úspěšnost" value={success.percent === null ? "—" : `${success.percent} %`} highlight />}
      </dl>
      {(notLaunched > 0 || success) && (
        <p className="mt-2 text-xs text-gray-500">
          {success && "Úspěšnost = podíl správných odpovědí u otázek se správnou odpovědí. "}
          {notLaunched > 0 && `${notLaunched} ${notLaunched === 1 ? "otázka nebyla spuštěna" : "otázek nebylo spuštěno"} a do výsledků se nepočítá.`}
        </p>
      )}

      {/* Stručný přehled otázek — podrobnosti po kliknutí níž. */}
      <ol className="mt-6 flex flex-col divide-y divide-gray-100 rounded-3xl border border-gray-200 bg-white shadow-soft">
        {launched.map((question, index) => {
          const questionRate = questionSuccess(question);
          return (
            <li key={question.id} className="flex items-center gap-3 px-5 py-3 text-sm">
              <span className="w-6 shrink-0 text-gray-400">{index + 1}.</span>
              <span className="min-w-0 flex-1 truncate text-gray-800">{question.text}</span>
              <span className="shrink-0 text-gray-500">
                {question.totalVotes} {votesLabel(question.totalVotes)}
              </span>
              {questionRate !== null && (
                <span className="shrink-0 rounded-full bg-pastel-green px-2.5 py-0.5 font-semibold text-emerald-800">✓ {questionRate} %</span>
              )}
            </li>
          );
        })}
        {launched.length === 0 && <li className="px-5 py-4 text-sm text-gray-500">Žádná otázka nebyla spuštěna.</li>}
      </ol>

      {launched.length > 0 && (
        <button
          type="button"
          onClick={() => setShowDetails((value) => !value)}
          aria-expanded={showDetails}
          className="mt-6 min-h-[52px] w-full rounded-2xl bg-brand px-6 text-base font-semibold text-white shadow-soft transition hover:bg-brand-dark focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/30"
        >
          {showDetails ? "Skrýt podrobné výsledky" : "Zobrazit podrobné výsledky"}
        </button>
      )}

      {showDetails && (
        <div className="mt-6 flex flex-col gap-5">
          {launched.map((question, index) => (
            <QuestionResultCard key={question.id} question={question} index={index} moderatorToken={moderatorToken} />
          ))}
        </div>
      )}

      <section className="mt-8 rounded-3xl border border-gray-200 bg-pastel-blue/60 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-600">Sdílení a export</h2>
        <div className="mt-3 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={onCopyLink}
            className="rounded-xl border-2 border-gray-200 bg-white px-5 py-2.5 text-sm font-semibold text-gray-800 hover:border-brand hover:text-brand"
          >
            {copyLabel}
          </button>
          {poll.requireParticipantName && (
            <a
              href={`/api/polls/moderator/${moderatorToken}/responses-csv`}
              className="rounded-xl border-2 border-gray-200 bg-white px-5 py-2.5 text-sm font-semibold text-gray-800 hover:border-brand hover:text-brand"
            >
              Stáhnout odpovědi se jmény (CSV)
            </a>
          )}
        </div>
        <div className="mt-4">
          <ResultsEmailButton
            moderatorToken={moderatorToken}
            resultsEmail={poll.resultsEmail}
            named={poll.requireParticipantName}
            onSent={onEmailSent}
          />
        </div>
      </section>

      <div className="mt-12">
        <AlphegaAffiliateBanner variant="standard" />
      </div>
    </main>
  );
}

function QuestionResultCard({ question, index, moderatorToken }: { question: ModeratorQuestionView; index: number; moderatorToken: string }) {
  const [showResponses, setShowResponses] = useState(false);
  const rate = questionSuccess(question);

  return (
    <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-soft">
      <h2 className="text-xl font-bold text-gray-900">
        {index + 1}. {question.text}
      </h2>
      {question.image && (
        <div className="mt-3">
          <QuestionImage image={question.image} maxHeightClass="max-h-56" />
        </div>
      )}
      <div className="mt-4">
        <ResultsBarChart
          options={question.options}
          totalVotes={question.totalVotes}
          correctOptionId={question.status === "ended" ? question.correctOptionId : null}
        />
      </div>
      <p className="mt-2 text-sm text-gray-500">
        Celkem: {question.totalVotes} {votesLabel(question.totalVotes)}
        {rate !== null && ` · správně ${rate} %`}
      </p>
      {question.link && <QuestionLink link={question.link} className="mt-3" />}

      {question.totalVotes > 0 && (
        <button
          type="button"
          onClick={() => setShowResponses((value) => !value)}
          aria-expanded={showResponses}
          className="mt-4 rounded-xl border-2 border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:border-brand hover:text-brand"
        >
          {showResponses ? "Skrýt odpovědi účastníků" : "Zobrazit odpovědi účastníků"}
        </button>
      )}
      {showResponses && <ResponsesTable moderatorToken={moderatorToken} questionId={question.id} />}
    </section>
  );
}

// Individuální odpovědi — načítají se až teď, po stránkách (100), přes
// moderátorský token. Žádný polling.
function ResponsesTable({ moderatorToken, questionId }: { moderatorToken: string; questionId: number }) {
  const [pages, setPages] = useState<QuestionResponsesPage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load(offset: number) {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/polls/moderator/${moderatorToken}/responses?questionId=${questionId}&offset=${offset}`, { cache: "no-store" });
      if (!response.ok) throw new Error();
      const page: QuestionResponsesPage = await response.json();
      setPages((previous) => [...previous, page]);
    } catch {
      setError("Odpovědi se nepodařilo načíst.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- jen první stránka při otevření
  }, []);

  const rows = pages.flatMap((page) => page.rows);
  const total = pages[0]?.total ?? 0;
  const hasResult = rows.some((row) => row.correct !== null);

  return (
    <div className="mt-4">
      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-gray-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-cream text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-3 py-2 font-semibold sm:px-4">Účastník</th>
                <th className="px-3 py-2 font-semibold sm:px-4">Odpověď</th>
                {hasResult && <th className="px-3 py-2 font-semibold sm:px-4">Výsledek</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((row, index) => (
                <tr key={index}>
                  <td className="break-words px-3 py-2 sm:px-4 text-gray-900">{row.label}</td>
                  <td className="break-words px-3 py-2 sm:px-4 text-gray-800">{row.optionText}</td>
                  {hasResult && (
                    <td className={`whitespace-nowrap px-3 py-2 font-semibold sm:px-4 ${row.correct ? "text-emerald-700" : "text-red-700"}`}>
                      {row.correct ? "✓ Správně" : "× Nesprávně"}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-gray-500">
        {loading && <span>Načítám…</span>}
        {error && <span className="text-red-700">{error}</span>}
        {!loading && rows.length > 0 && (
          <span>
            Zobrazeno {rows.length} z {total}
          </span>
        )}
        {!loading && rows.length < total && (
          <button type="button" onClick={() => void load(rows.length)} className="font-semibold text-brand hover:underline">
            Načíst další
          </button>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 text-center shadow-soft ${highlight ? "border-emerald-200 bg-pastel-green" : "border-gray-200 bg-white"}`}>
      <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className={`mt-1 text-2xl font-bold ${highlight ? "text-emerald-800" : "text-gray-900"}`}>{value}</dd>
    </div>
  );
}
