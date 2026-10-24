"use client";

import { useState } from "react";
import type { ModeratorPollView } from "../../../lib/polls/types.ts";

// Odeslání výsledků na e-mail z vytvoření hlasování. Příjemce se nezadává
// (server ho bere z DB), UI jen ukazuje maskovanou adresu a stav.
export default function ResultsEmailButton({
  moderatorToken,
  resultsEmail,
  onSent,
}: {
  moderatorToken: string;
  resultsEmail: ModeratorPollView["resultsEmail"];
  onSent: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  if (!resultsEmail.to) {
    return (
      <p className="text-sm text-gray-600">
        Poslat výsledky e-mailem nejde – při vytvoření hlasování nebyl vyplněný e-mail.
      </p>
    );
  }
  if (!resultsEmail.configured) {
    return <p className="text-sm text-gray-600">Odesílání e-mailů je teď nedostupné.</p>;
  }

  async function send() {
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/polls/moderator/${moderatorToken}/results-email`, { method: "POST" });
      if (response.ok) {
        setMessage({ tone: "ok", text: `Odesláno na ${resultsEmail.to}. Doručení může trvat pár minut.` });
        onSent();
      } else if (response.status === 429 && response.headers.get("retry-after")) {
        const minutes = Math.ceil(Number(response.headers.get("retry-after")) / 60);
        setMessage({ tone: "error", text: `Výsledky jste právě poslali. Znovu to půjde za ${minutes} min.` });
      } else {
        const body = await response.json().catch(() => null);
        setMessage({ tone: "error", text: body?.error ?? "E-mail se nepodařilo odeslat." });
      }
    } catch {
      setMessage({ tone: "error", text: "E-mail se nepodařilo odeslat. Zkontrolujte připojení." });
    } finally {
      setPending(false);
    }
  }

  const exhausted = resultsEmail.remaining <= 0;

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={send}
        disabled={pending || exhausted}
        className="self-start rounded-xl border-2 border-gray-200 bg-white px-5 py-2.5 text-sm font-semibold text-gray-800 transition hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/20 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Odesílám…" : "Poslat výsledky e-mailem"}
      </button>
      <p className="text-sm text-gray-600">
        {exhausted
          ? `Výsledky už byly odeslány na ${resultsEmail.to} (limit vyčerpán).`
          : resultsEmail.lastSentAt
            ? `Naposledy odesláno ${new Date(resultsEmail.lastSentAt).toLocaleString("cs-CZ")} na ${resultsEmail.to}.`
            : `Přijde na ${resultsEmail.to}, i s tabulkou CSV.`}
      </p>
      {message && (
        <p role="status" className={message.tone === "ok" ? "text-sm text-emerald-700" : "text-sm text-red-700"}>
          {message.text}
        </p>
      )}
    </div>
  );
}
