"use client";

import { useCallback, useEffect, useState } from "react";
import QuestionImage from "./QuestionImage.tsx";
import QuestionLink from "./QuestionLink.tsx";
import ResultsBarChart, { votesLabel } from "./ResultsBarChart.tsx";
import { getPersistentParticipantId } from "../lib/participant-id.ts";
import type { FinalResultsView, PublicPollView } from "../lib/polls/types.ts";

type State =
  | { kind: "loading" }
  | { kind: "no_storage" }
  | { kind: "error"; message: string }
  | { kind: "question"; poll: PublicPollView }
  | { kind: "results"; results: FinalResultsView };

/**
 * Veřejná anketa (režim self_service) — samostatná stránka /<kód> i widget
 * /embed/<kód>. Bez pollingu: stav se načte jednou, po hlasu se načtou
 * výsledky (ty server vydá jen tomu, kdo už hlasoval, nebo po ukončení).
 * Hlasuje se přes stejný endpoint a se stejnou ochranou jako živé hlasování.
 */
export default function PublicPoll({ publicCode, embed = false }: { publicCode: string; embed?: boolean }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [participantId, setParticipantId] = useState<string | null>(null);
  const [voting, setVoting] = useState(false);
  const [voteError, setVoteError] = useState<string | null>(null);

  const load = useCallback(
    async (id: string) => {
      try {
        const results = await fetch(`/api/polls/public/${publicCode}/final-results?participantId=${encodeURIComponent(id)}`, { cache: "no-store" });
        if (results.ok) {
          setState({ kind: "results", results: await results.json() });
          return;
        }
        if (results.status === 404) {
          setState({ kind: "error", message: "Anketa neexistuje nebo už vypršela." });
          return;
        }
        const view = await fetch(`/api/polls/public/${publicCode}`);
        if (!view.ok) throw new Error();
        setState({ kind: "question", poll: await view.json() });
      } catch {
        setState({ kind: "error", message: "Anketu se nepodařilo načíst. Zkuste to prosím znovu." });
      }
    },
    [publicCode]
  );

  useEffect(() => {
    const id = getPersistentParticipantId();
    if (!id) {
      setState({ kind: "no_storage" });
      return;
    }
    setParticipantId(id);
    void load(id);
  }, [load]);

  async function vote(questionId: number, optionId: number) {
    if (!participantId || voting) return;
    setVoting(true);
    setVoteError(null);
    try {
      const response = await fetch(`/api/polls/public/${publicCode}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId, optionId, participantId }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setVoteError(response.status === 429 ? "Z tohoto připojení už přišlo příliš mnoho hlasů. Zkuste to později." : (body.error ?? "Hlas se nepodařilo odeslat."));
        if (response.status === 409 || response.status === 400) await load(participantId);
        return;
      }
      await load(participantId);
    } catch {
      setVoteError("Hlas se nepodařilo odeslat. Zkontrolujte připojení.");
    } finally {
      setVoting(false);
    }
  }

  // Relativně = na doméně widgetu (hlasuju.cz), v nové záložce už první strana.
  const standaloneUrl = `/${publicCode}`;

  return (
    <div className={embed ? "flex min-h-full flex-col p-4" : "w-full"}>
      <div className="flex-1">
        {state.kind === "loading" && <p className="py-8 text-center text-gray-500">Načítám anketu…</p>}

        {state.kind === "error" && <p className="py-8 text-center text-gray-700">{state.message}</p>}

        {state.kind === "no_storage" && (
          <div className="py-6 text-center">
            <p className="text-gray-800">Váš prohlížeč v tomto vloženém okně neumožňuje hlasovat (blokuje ukládání dat).</p>
            <a
              href={standaloneUrl}
              target="_blank"
              rel="noopener"
              className="mt-4 inline-block rounded-2xl bg-brand px-5 py-3 font-semibold text-white hover:bg-brand-dark"
            >
              Hlasovat na hlasuju.cz ↗
            </a>
          </div>
        )}

        {state.kind === "question" && <QuestionStep poll={state.poll} embed={embed} voting={voting} onVote={vote} />}

        {state.kind === "results" && <ResultsStep results={state.results} embed={embed} onRefresh={() => participantId && load(participantId)} />}

        {voteError && (
          <p role="alert" className="mt-4 text-center text-sm text-red-700">
            {voteError}
          </p>
        )}
      </div>

      {embed && (
        <p className="mt-4 text-right text-xs text-gray-400">
          <a href="https://hlasuju.cz/pro-weby" target="_blank" rel="noopener" className="hover:text-brand">
            Pohání Hlasuju.cz
          </a>
        </p>
      )}
    </div>
  );
}

function QuestionStep({
  poll,
  embed,
  voting,
  onVote,
}: {
  poll: PublicPollView;
  embed: boolean;
  voting: boolean;
  onVote: (questionId: number, optionId: number) => void;
}) {
  const question = poll.activeQuestion;
  if (poll.pollStatus !== "active" || !question) {
    return <p className="py-8 text-center text-gray-700">Hlasování v této anketě už skončilo.</p>;
  }
  const Heading = embed ? "h2" : "h1";
  return (
    <div>
      {poll.title && <p className="text-sm font-semibold text-brand">{poll.title}</p>}
      <Heading className={`mt-1 font-bold text-gray-900 ${embed ? "text-xl" : "text-2xl sm:text-3xl"}`}>{question.text}</Heading>
      {question.image && (
        <QuestionImage image={question.image} maxHeightClass={embed ? "max-h-48" : "max-h-[32vh] sm:max-h-[40vh]"} className="mt-4" priority={!embed} />
      )}
      <div className="mt-5 flex flex-col gap-2.5">
        {question.options.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => onVote(question.id, option.id)}
            disabled={voting}
            className={`w-full rounded-2xl border-2 border-gray-200 bg-white px-5 text-left font-semibold text-gray-900 transition hover:border-brand hover:bg-brand-light/40 hover:text-brand-dark focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/20 active:scale-[0.99] disabled:opacity-60 ${embed ? "min-h-[48px] py-2.5" : "min-h-[60px] py-3.5 text-lg shadow-soft"}`}
          >
            {option.text}
          </button>
        ))}
      </div>
      {question.link && <QuestionLink link={question.link} className="mt-4" />}
      <p className="mt-4 text-xs text-gray-500">Hlasovat můžete jednou, anonymně. Výsledky uvidíte hned po odeslání.</p>
    </div>
  );
}

function ResultsStep({ results, embed, onRefresh }: { results: FinalResultsView; embed: boolean; onRefresh: () => void }) {
  const question = results.questions[0];
  if (!question) return <p className="py-8 text-center text-gray-700">Anketa nemá žádné výsledky.</p>;
  const closed = results.pollStatus === "closed";
  const Heading = embed ? "h2" : "h1";
  return (
    <div>
      {results.title && <p className="text-sm font-semibold text-brand">{results.title}</p>}
      <Heading className={`mt-1 font-bold text-gray-900 ${embed ? "text-xl" : "text-2xl sm:text-3xl"}`}>{question.text}</Heading>
      {question.participantSelectedOptionId !== null && (
        <p className="mt-3 rounded-xl bg-pastel-green px-4 py-2.5 text-sm font-semibold text-emerald-800">✓ Děkujeme, váš hlas je započítaný.</p>
      )}
      {closed && <p className="mt-3 rounded-xl bg-pastel-blue px-4 py-2.5 text-sm text-gray-800">Anketa je ukončená, hlasovat už nelze.</p>}
      <div className="mt-4">
        <ResultsBarChart
          options={question.options}
          totalVotes={question.totalVotes}
          selectedOptionId={question.participantSelectedOptionId}
          correctOptionId={closed ? question.correctOptionId : null}
        />
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-gray-500">
        <span>
          Celkem {question.totalVotes} {votesLabel(question.totalVotes)}
        </span>
        {!closed && (
          <button type="button" onClick={onRefresh} className="font-semibold text-brand hover:underline">
            Aktualizovat výsledky
          </button>
        )}
      </div>
      <p className="mt-3 text-xs text-gray-500">Orientační výsledky ankety, nejde o reprezentativní průzkum.</p>
    </div>
  );
}
