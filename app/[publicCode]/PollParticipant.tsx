"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { usePolling } from "../../lib/use-polling.ts";
import { getOrCreateParticipantId } from "../../lib/participant-id.ts";
import AlphegaAffiliateBanner from "../../components/AlphegaAffiliateBanner.tsx";
import QuestionImage from "../../components/QuestionImage.tsx";
import QuestionLink from "../../components/QuestionLink.tsx";
import ResultsBarChart from "../../components/ResultsBarChart.tsx";
import type { FinalResultsView, PublicPollView } from "../../lib/polls/types.ts";

// Klientská hlídka "hlasoval(a) jsem už u téhle otázky" — resetuje se
// pokaždé, když moderátor aktivuje jinou otázku (viz activeQuestionId
// v effectu níž). Server má vlastní nezávislou ochranu (unique index),
// tohle je jen pro instantní UX bez čekání na chybu z API.
export default function PollParticipant({ publicCode }: { publicCode: string }) {
  const [participantId, setParticipantId] = useState<string | null>(null);
  const [voted, setVoted] = useState<{ questionId: number; optionId: number; optionText: string } | null>(null);
  const [voting, setVoting] = useState(false);
  const [voteError, setVoteError] = useState<string | null>(null);

  useEffect(() => {
    setParticipantId(getOrCreateParticipantId());
  }, []);

  const fetcher = useCallback(
    async (signal: AbortSignal) => {
      const response = await fetch(`/api/polls/public/${publicCode}`, { signal, cache: "no-store" });
      if (response.status === 404) return { notFound: true as const };
      if (!response.ok) throw new Error("Nepodařilo se načíst hlasování.");
      const data: PublicPollView = await response.json();
      return { notFound: false as const, poll: data };
    },
    [publicCode]
  );

  const { data, error } = usePolling(fetcher);

  const activeQuestion = data && !data.notFound ? data.poll.activeQuestion : null;
  const closedQuestion = data && !data.notFound ? data.poll.closedQuestion : null;

  useEffect(() => {
    if (activeQuestion && voted !== null && voted.questionId !== activeQuestion.id) {
      setVoted(null);
      setVoteError(null);
    }
  }, [activeQuestion, voted]);

  async function castVote(optionId: number, optionText: string) {
    if (!activeQuestion || !participantId || voting) return;
    setVoting(true);
    setVoteError(null);
    try {
      const response = await fetch(`/api/polls/public/${publicCode}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId: activeQuestion.id, optionId, participantId }),
      });
      const body = await response.json();
      if (!response.ok) {
        setVoteError(body.error ?? "Hlas se nepodařilo zaznamenat.");
        setVoting(false);
        return;
      }
      setVoted({ questionId: activeQuestion.id, optionId, optionText });
    } catch {
      setVoteError("Hlas se nepodařilo zaznamenat. Zkuste to prosím znovu.");
    } finally {
      setVoting(false);
    }
  }

  if (data?.notFound) {
    return (
      <StateScreen
        title="Hlasování nenalezeno"
        message="Zkontrolujte kód, nebo požádejte moderátora o nový odkaz. Hlasování mohlo taky vypršet."
      />
    );
  }

  if (!data && !error) {
    return <StateScreen title="Připojuji se…" message="Chvilku strpení." />;
  }

  if (data && !data.notFound && data.poll.pollStatus === "closed") {
    if (!participantId) {
      return <StateScreen title="Hlasování skončilo" message="Načítám výsledky…" />;
    }
    return <FinalResultsSection publicCode={publicCode} participantId={participantId} />;
  }

  if (closedQuestion) {
    // Fáze vyhodnocení: moderátor otázku ukončil, další ještě nespustil.
    // Teprve tady se odkrývá odkaz (může obsahovat správnou odpověď).
    return (
      <StateScreen title="Hlasování u otázky skončilo" message="Čekáme na další otázku…" showAd>
        <div className="mt-6 text-left">
          <p className="font-semibold text-gray-900">{closedQuestion.text}</p>
          {closedQuestion.correctOptionId !== null && (
            <AnswerEvaluation
              options={closedQuestion.options}
              correctOptionId={closedQuestion.correctOptionId}
              myOptionId={voted?.questionId === closedQuestion.id ? voted.optionId : null}
            />
          )}
          {closedQuestion.link && <QuestionLink link={closedQuestion.link} className="mt-3" />}
        </div>
      </StateScreen>
    );
  }

  if (!activeQuestion) {
    return (
      <StateScreen title="Jste připojeni" message="Čekáme na další otázku moderátora…" showAd />
    );
  }

  if (voted?.questionId === activeQuestion.id) {
    // Hlas je odeslaný, hlavní úkol dokončen -> compact banner je tu v
    // pořádku (viz zadání "zobraz ho ve chvíli, kdy uživatel odešle
    // odpověď"), nikdy ale nad/mezi otázkou a odpověďmi výš.
    return (
      <StateScreen title="✓ Hlas byl zaznamenán" message="Čekáme na další otázku…" showAd>
        {voted.optionText && (
          <p className="mt-4 rounded-xl bg-pastel-green px-4 py-3 text-gray-800">
            Vaše odpověď: <span className="font-semibold">{voted.optionText}</span>
          </p>
        )}
      </StateScreen>
    );
  }

  // Obrázek smí zabrat jen část výšky displeje, aby odpovědi zůstaly
  // dosažitelné bez dlouhého scrollování; detail ukáže zvětšení (tap).
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-6 sm:py-10">
      <div className="w-full max-w-md">
        {activeQuestion.image && (
          <QuestionImage image={activeQuestion.image} maxHeightClass="max-h-[32vh] sm:max-h-[40vh]" className="mb-5" priority />
        )}
        <h1 className="text-center text-2xl font-bold text-gray-900 sm:text-3xl">{activeQuestion.text}</h1>

        <div className="mt-6 flex flex-col gap-3 sm:mt-8">
          {activeQuestion.options.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => castVote(option.id, option.text)}
              disabled={voting || !participantId}
              className="min-h-[64px] w-full rounded-2xl border-2 border-gray-200 bg-white px-6 py-4 text-lg font-semibold text-gray-900 shadow-soft transition hover:border-brand hover:bg-brand-light/40 hover:text-brand-dark focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/20 active:scale-[0.99] disabled:opacity-60"
            >
              {option.text}
            </button>
          ))}
        </div>

        {voteError && <p className="mt-4 text-center text-sm text-red-600">{voteError}</p>}

        {activeQuestion.link && <QuestionLink link={activeQuestion.link} className="mt-6" />}
      </div>
    </main>
  );
}

// Vyhodnocení ukončené otázky se správnou odpovědí (bez počtů hlasů —
// ty účastník během hlasování neviděl ani dřív). ✓/× + text, ne jen barva.
function AnswerEvaluation({
  options,
  correctOptionId,
  myOptionId,
}: {
  options: { id: number; text: string }[];
  correctOptionId: number;
  myOptionId: number | null;
}) {
  return (
    <>
      {myOptionId !== null && (
        <p className={`mt-4 rounded-xl px-4 py-3 font-semibold ${myOptionId === correctOptionId ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>
          {myOptionId === correctOptionId ? "✓ Odpověděli jste správně." : "× Tentokrát to nevyšlo."}
        </p>
      )}
      <ul className="mt-3 flex flex-col gap-2">
        {options.map((option) => {
          const correct = option.id === correctOptionId;
          return (
            <li
              key={option.id}
              className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 ${correct ? "border-2 border-emerald-600 bg-emerald-50" : "border-red-200 bg-red-50/60"}`}
            >
              <span aria-hidden="true" className={`font-bold ${correct ? "text-emerald-700" : "text-red-700"}`}>
                {correct ? "✓" : "×"}
              </span>
              <span className={correct ? "font-semibold text-gray-900" : "text-gray-800"}>{option.text}</span>
              <span className="sr-only">{correct ? "(správná odpověď)" : "(nesprávná odpověď)"}</span>
              {option.id === myOptionId && <span className="ml-auto text-xs font-semibold text-gray-600">Vaše odpověď</span>}
            </li>
          );
        })}
      </ul>
    </>
  );
}

function StateScreen({
  title,
  message,
  showAd = false,
  children,
}: {
  title: string;
  message: string;
  showAd?: boolean;
  children?: ReactNode;
}) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-10 text-center">
      <div className="w-full max-w-sm">
        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-soft sm:p-8">
          <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
          <p className="mt-3 text-gray-600">{message}</p>
          {children}
        </div>
        {showAd && (
          <div className="mt-10">
            <AlphegaAffiliateBanner variant="compact" />
          </div>
        )}
      </div>
    </main>
  );
}

// Jednorázový fetch (ne polling) — jakmile je poll uzavřený, hlasy se
// už nemění (cast-vote odmítá hlasy mimo status "active"), takže
// opakované dotazování by bylo zbytečné.
function FinalResultsSection({ publicCode, participantId }: { publicCode: string; participantId: string }) {
  const [data, setData] = useState<FinalResultsView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/polls/public/${publicCode}/final-results?participantId=${encodeURIComponent(participantId)}`, {
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error("Nepodařilo se načíst výsledky.");
        return response.json();
      })
      .then((result: FinalResultsView) => setData(result))
      .catch((err) => {
        if (!(err instanceof DOMException && err.name === "AbortError")) {
          setError("Nepodařilo se načíst výsledky.");
        }
      });
    return () => controller.abort();
  }, [publicCode, participantId]);

  if (error) {
    return <StateScreen title="Hlasování skončilo" message={error} />;
  }

  if (!data) {
    return <StateScreen title="Hlasování skončilo" message="Načítám výsledky…" />;
  }

  return (
    <main className="mx-auto min-h-screen max-w-md px-4 py-10">
      <h1 className="text-center text-3xl font-bold text-gray-900">Hlasování skončilo</h1>
      {data.title && <p className="mt-2 text-center text-lg text-gray-600">{data.title}</p>}

      <div className="mt-8 flex flex-col gap-5">
        {data.questions.map((q, index) => (
          <section key={q.id} className="rounded-3xl border border-gray-200 bg-white p-5 shadow-soft">
            <h2 className="text-xl font-bold text-gray-900">
              {index + 1}. {q.text}
            </h2>
            {q.participantSelectedOptionId === null && (
              <p className="mt-2 text-sm text-gray-500">Na tuto otázku jste nehlasoval/a.</p>
            )}
            {q.image && (
              <div className="mt-3">
                <QuestionImage image={q.image} maxHeightClass="max-h-56" />
              </div>
            )}
            <div className="mt-4">
              <ResultsBarChart
                options={q.options}
                totalVotes={q.totalVotes}
                selectedOptionId={q.participantSelectedOptionId}
                correctOptionId={q.correctOptionId}
              />
            </div>
            {q.link && <QuestionLink link={q.link} className="mt-3" />}
          </section>
        ))}
      </div>

      <div className="mt-12">
        <AlphegaAffiliateBanner variant="standard" />
      </div>
    </main>
  );
}
