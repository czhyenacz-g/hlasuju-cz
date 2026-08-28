"use client";

import { useCallback, useEffect, useState } from "react";
import { usePolling } from "../../lib/use-polling.ts";
import { getOrCreateParticipantId } from "../../lib/participant-id.ts";
import AdSlot from "../../components/AdSlot.tsx";
import type { PublicPollView } from "../../lib/polls/types.ts";

// Klientská hlídka "hlasoval(a) jsem už u téhle otázky" — resetuje se
// pokaždé, když moderátor aktivuje jinou otázku (viz activeQuestionId
// v effectu níž). Server má vlastní nezávislou ochranu (unique index),
// tohle je jen pro instantní UX bez čekání na chybu z API.
export default function PollParticipant({ publicCode }: { publicCode: string }) {
  const [participantId, setParticipantId] = useState<string | null>(null);
  const [votedQuestionId, setVotedQuestionId] = useState<number | null>(null);
  const [voting, setVoting] = useState(false);
  const [voteError, setVoteError] = useState<string | null>(null);

  useEffect(() => {
    setParticipantId(getOrCreateParticipantId());
  }, []);

  const fetcher = useCallback(
    async (signal: AbortSignal) => {
      const response = await fetch(`/api/polls/public/${publicCode}`, { signal });
      if (response.status === 404) return { notFound: true as const };
      if (!response.ok) throw new Error("Nepodařilo se načíst hlasování.");
      const data: PublicPollView = await response.json();
      return { notFound: false as const, poll: data };
    },
    [publicCode]
  );

  const { data, error } = usePolling(fetcher);

  const activeQuestion = data && !data.notFound ? data.poll.activeQuestion : null;

  useEffect(() => {
    if (activeQuestion && votedQuestionId !== null && votedQuestionId !== activeQuestion.id) {
      setVotedQuestionId(null);
      setVoteError(null);
    }
  }, [activeQuestion, votedQuestionId]);

  async function castVote(optionId: number) {
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
      setVotedQuestionId(activeQuestion.id);
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
    return <StateScreen title="Hlasování bylo ukončeno" message="Děkujeme za účast." />;
  }

  if (!activeQuestion) {
    return (
      <StateScreen title="Jste připojeni" message="Čekáme na další otázku moderátora…" showAd />
    );
  }

  if (votedQuestionId === activeQuestion.id) {
    return <StateScreen title="✓ Hlas byl zaznamenán" message="Čekáme na další otázku…" />;
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <h1 className="text-center text-2xl font-bold text-gray-900 sm:text-3xl">{activeQuestion.text}</h1>

        <div className="mt-8 flex flex-col gap-3">
          {activeQuestion.options.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => castVote(option.id)}
              disabled={voting || !participantId}
              className="min-h-[64px] w-full rounded-2xl border-2 border-gray-200 bg-white px-6 py-4 text-lg font-semibold text-gray-900 transition hover:border-brand hover:text-brand disabled:opacity-60"
            >
              {option.text}
            </button>
          ))}
        </div>

        {voteError && <p className="mt-4 text-center text-sm text-red-600">{voteError}</p>}
      </div>
    </main>
  );
}

function StateScreen({ title, message, showAd = false }: { title: string; message: string; showAd?: boolean }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-10 text-center">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
        <p className="mt-3 text-gray-600">{message}</p>
        {showAd && (
          <div className="mt-10">
            <AdSlot label="Reklamní plocha — čekání na otázku" />
          </div>
        )}
      </div>
    </main>
  );
}
