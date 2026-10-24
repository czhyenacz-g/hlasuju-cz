"use client";

import type { ModeratorQuestionView } from "../../../lib/polls/types.ts";

export type ModeratorAction = "activate" | "close" | "end";

export function confirmReopen(): boolean {
  return window.confirm("Otázka už byla ukončená. Znovu ji otevřít pro hlasování? Dosavadní hlasy zůstanou zachované.");
}

/**
 * Hlavní akce podle stavu otázky — stejná v řídicí konzoli i v promítání:
 * připravená → Spustit, běžící → Ukončit otázku, ukončená → Znovu otevřít
 * (s potvrzením; hlasy zůstávají, viz lib/polls/activate-question.ts).
 */
export function PrimaryQuestionAction({
  question,
  pending,
  onAction,
  large = false,
}: {
  question: ModeratorQuestionView;
  pending: boolean;
  onAction: (action: ModeratorAction, questionId?: number) => void;
  large?: boolean;
}) {
  const size = large ? "px-6 py-3 text-base" : "px-5 py-2.5 text-sm";
  if (question.status === "active") {
    return (
      <button
        type="button"
        onClick={() => onAction("close", question.id)}
        disabled={pending}
        className={`rounded-xl bg-gray-900 font-semibold text-white hover:bg-gray-700 disabled:opacity-60 ${size}`}
      >
        ■ Ukončit otázku
      </button>
    );
  }
  if (question.status === "ended") {
    return (
      <button
        type="button"
        onClick={() => confirmReopen() && onAction("activate", question.id)}
        disabled={pending}
        className={`rounded-xl border-2 border-gray-300 font-semibold text-gray-700 hover:border-brand hover:text-brand disabled:opacity-60 ${size}`}
      >
        ↺ Znovu otevřít
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onAction("activate", question.id)}
      disabled={pending}
      className={`rounded-xl bg-brand font-semibold text-white hover:bg-brand-dark disabled:opacity-60 ${size}`}
    >
      ▶ Spustit otázku
    </button>
  );
}

export function QuestionStatusBadge({
  question,
  isCurrent,
  compact = false,
}: {
  question: ModeratorQuestionView;
  isCurrent: boolean;
  compact?: boolean;
}) {
  const base = "shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold";
  if (question.status === "active") {
    return <span className={`${base} bg-green-100 text-green-800`}>● Hlasuje se{compact ? "" : ` · ${question.totalVotes} hlasů`}</span>;
  }
  if (question.status === "ended") {
    return (
      <span className={`${base} bg-gray-100 text-gray-700`}>
        {isCurrent ? "Vyhodnocení" : "Ukončeno"}
        {compact ? "" : ` · ${question.totalVotes} hlasů`}
      </span>
    );
  }
  return <span className={`${base} bg-brand/10 text-brand`}>Připraveno</span>;
}

