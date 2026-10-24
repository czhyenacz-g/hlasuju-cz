"use client";

import { useEffect, useRef, useState } from "react";
import QrCode from "../../../components/QrCode.tsx";
import QuestionImage from "../../../components/QuestionImage.tsx";
import QuestionLink from "../../../components/QuestionLink.tsx";
import ResultsBarChart from "../../../components/ResultsBarChart.tsx";
import { PrimaryQuestionAction, type ModeratorAction } from "./QuestionControls.tsx";
import type { ModeratorPollView, ModeratorQuestionView } from "../../../lib/polls/types.ts";

const LETTERS = "ABCDEFGHIJ";

function formatCode(code: string) {
  return `${code.slice(0, 3)} ${code.slice(3)}`;
}

function isInteractive(target: EventTarget | null) {
  return target instanceof HTMLElement && Boolean(target.closest("button, a, input, textarea, select"));
}

/**
 * Promítací režim — celá obrazovka, velké písmo, vysoký kontrast, ovládací
 * prvky jen nenápadně dole. Přednášející ho ovládá i bez myši:
 *   Mezerník / Enter  … další krok (spustit → ukončit a ukázat výsledky → další otázka)
 *   → / PageDown      … další otázka (funguje i s prezentérem)
 *   ← / PageUp        … předchozí otázka
 *   R … výsledky, Q … QR kód, F … celá obrazovka, Esc … zpět do řízení
 * Výsledky se během hlasování ve výchozím stavu neukazují (neovlivňují
 * hlasující), po ukončení otázky se zobrazí samy.
 */
export default function PresentationView({
  poll,
  question,
  questionIndex,
  publicUrl,
  pending,
  error,
  onSelect,
  onAction,
  onClose,
}: {
  poll: ModeratorPollView;
  question: ModeratorQuestionView;
  questionIndex: number;
  publicUrl: string;
  pending: boolean;
  error: string | null;
  onSelect: (questionId: number) => void;
  onAction: (action: ModeratorAction, questionId?: number) => void;
  onClose: () => void;
}) {
  const [resultsOverride, setResultsOverride] = useState<{ questionId: number; visible: boolean } | null>(null);
  const [showQr, setShowQr] = useState(false);
  const showResults =
    resultsOverride?.questionId === question.id ? resultsOverride.visible : question.status === "ended";
  const linkVisible = question.link && (question.status === "ended" || question.link.showDuringVoting);

  const previous = poll.questions[questionIndex - 1];
  const next = poll.questions[questionIndex + 1];

  // Aktuální hodnoty pro klávesové zkratky bez znovuregistrace listeneru.
  const stateRef = useRef({ question, previous, next, pending, showResults, showQr });
  stateRef.current = { question, previous, next, pending, showResults, showQr };

  useEffect(() => {
    function primaryStep() {
      const { question: current, next: following, pending: busy } = stateRef.current;
      if (busy) return;
      if (current.status === "prepared") onAction("activate", current.id);
      else if (current.status === "active") onAction("close", current.id);
      else if (following) onSelect(following.id);
    }

    function onKey(event: KeyboardEvent) {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const { question: current, previous: before, next: following, showResults: visible } = stateRef.current;
      switch (event.key) {
        case " ":
        case "Enter":
          if (isInteractive(event.target)) return;
          event.preventDefault();
          primaryStep();
          break;
        case "ArrowRight":
        case "PageDown":
          event.preventDefault();
          if (following) onSelect(following.id);
          break;
        case "ArrowLeft":
        case "PageUp":
          event.preventDefault();
          if (before) onSelect(before.id);
          break;
        case "r":
        case "R":
          setResultsOverride({ questionId: current.id, visible: !visible });
          break;
        case "q":
        case "Q":
          setShowQr((value) => !value);
          break;
        case "f":
        case "F":
          toggleFullscreen();
          break;
        case "Escape":
          if (stateRef.current.showQr) setShowQr(false);
          else if (!document.fullscreenElement) onClose();
          break;
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onAction, onSelect, onClose]);

  function toggleFullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen?.();
    else void document.documentElement.requestFullscreen?.().catch(() => {});
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white text-gray-900">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-gray-100 px-6 py-3 lg:px-12">
        <p className="text-lg text-gray-600 lg:text-2xl">
          Hlasujte na <span className="font-bold text-gray-900">hlasuju.cz</span> · kód{" "}
          <span className="font-bold tracking-widest text-brand">{formatCode(poll.publicCode)}</span>
        </p>
        <p className="text-base font-semibold text-gray-500 lg:text-xl">
          Otázka {questionIndex + 1} / {poll.questions.length}
          {question.status === "active" && <span className="ml-3 text-green-700">● hlasuje se</span>}
          {question.status === "ended" && <span className="ml-3 text-gray-500">hlasování ukončeno</span>}
        </p>
      </header>

      <main className={`flex min-h-0 flex-1 flex-col overflow-y-auto px-6 py-5 ${question.image ? "lg:px-8 lg:py-4" : "lg:px-12 lg:py-6"}`}>
        <h1 className={`text-3xl font-bold leading-tight ${question.image ? "lg:text-4xl xl:text-5xl" : "lg:text-5xl"}`}>{question.text}</h1>

        <div
          className={`mt-5 flex-1 ${
            question.image
              ? // S obrázkem: obrázek ~65 % šířky, odpovědi ~35 % (s výsledky
                // ~60/40 — pruhy a procenta potřebují víc místa). Výška obrázku
                // = zbytek obrazovky po hlavičce, nadpisu a patičce (max. 70vh).
                `grid items-center gap-6 lg:mt-4 lg:gap-8 ${
                  showResults ? "lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]" : "lg:grid-cols-[minmax(0,1.85fr)_minmax(0,1fr)]"
                }`
              : "flex flex-col justify-center lg:mt-6"
          }`}
        >
          {question.image && (
            <>
              <QuestionImage image={question.image} maxHeightClass="max-h-[55vh]" className="lg:hidden" priority />
              <QuestionImage image={question.image} fitHeight="min(70vh, 100vh - 16rem)" className="hidden lg:block" priority />
            </>
          )}

          <div className="flex min-w-0 flex-col gap-6">
            {showResults ? (
              <ResultsBarChart
                options={question.options}
                totalVotes={question.totalVotes}
                // Vyhodnocení až po ukončení otázky — během hlasování (i po
                // znovuotevření) se správná odpověď na plátně neukáže.
                correctOptionId={question.status === "ended" ? question.correctOptionId : null}
                large
              />
            ) : (
              <ol className="flex flex-col gap-3 lg:gap-4">
                {question.options.map((option, index) => (
                  <li key={option.id} className="flex items-center gap-4 rounded-2xl border-2 border-gray-200 px-5 py-3 lg:px-6 lg:py-4">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand text-xl font-bold text-white lg:h-12 lg:w-12 lg:text-2xl">
                      {LETTERS[index]}
                    </span>
                    <span className={`min-w-0 break-words text-2xl font-medium ${question.image ? "lg:text-3xl" : "lg:text-4xl"}`}>{option.text}</span>
                  </li>
                ))}
              </ol>
            )}
            {linkVisible && question.link && <QuestionLink link={question.link} large />}
          </div>
        </div>
      </main>

      <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-gray-100 px-6 py-3 lg:px-12">
        <p className="text-xl font-semibold text-gray-700 lg:text-2xl">
          {question.status === "prepared" ? "Připraveno ke spuštění" : `Hlasů: ${question.totalVotes}`}
        </p>
        {/* Ovládání je záměrně tlumené — v promítání nemá rušit. */}
        <div className="flex flex-wrap items-center gap-2 opacity-60 transition hover:opacity-100 focus-within:opacity-100">
          {error && <span className="mr-2 text-sm text-red-600">{error}</span>}
          <button
            type="button"
            onClick={() => previous && onSelect(previous.id)}
            disabled={!previous}
            className="rounded-xl border border-gray-300 px-3 py-2 text-sm font-semibold disabled:opacity-30"
            title="Předchozí otázka (←)"
          >
            ←
          </button>
          <PrimaryQuestionAction question={question} pending={pending} onAction={onAction} />
          {question.status === "ended" && next && (
            <button
              type="button"
              onClick={() => onSelect(next.id)}
              className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white"
              title="Další otázka (mezerník)"
            >
              Další otázka →
            </button>
          )}
          <button
            type="button"
            onClick={() => next && onSelect(next.id)}
            disabled={!next}
            className="rounded-xl border border-gray-300 px-3 py-2 text-sm font-semibold disabled:opacity-30"
            title="Další otázka (→)"
          >
            →
          </button>
          <button
            type="button"
            onClick={() => setResultsOverride({ questionId: question.id, visible: !showResults })}
            className="rounded-xl border border-gray-300 px-3 py-2 text-sm font-semibold"
            title="Zobrazit/skrýt výsledky (R)"
          >
            {showResults ? "Skrýt výsledky" : "Výsledky"}
          </button>
          <button type="button" onClick={() => setShowQr(true)} className="rounded-xl border border-gray-300 px-3 py-2 text-sm font-semibold" title="QR kód (Q)">
            QR
          </button>
          <button type="button" onClick={toggleFullscreen} className="rounded-xl border border-gray-300 px-3 py-2 text-sm font-semibold" title="Celá obrazovka (F)">
            Celá obrazovka
          </button>
          <button type="button" onClick={onClose} className="rounded-xl border border-gray-300 px-3 py-2 text-sm font-semibold" title="Zpět do řízení (Esc)">
            Zavřít
          </button>
        </div>
      </footer>

      {showQr && (
        <div
          className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-6 bg-white p-6 text-center"
          onClick={() => setShowQr(false)}
          role="dialog"
          aria-label="QR kód pro připojení"
        >
          <QrCode value={publicUrl} size={Math.min(520, typeof window !== "undefined" ? window.innerHeight - 260 : 420)} />
          <p className="text-3xl text-gray-700 lg:text-5xl">
            <span className="font-bold text-gray-900">hlasuju.cz</span> · kód{" "}
            <span className="font-bold tracking-widest text-brand">{formatCode(poll.publicCode)}</span>
          </p>
          <p className="text-sm text-gray-400">Kliknutím nebo klávesou Q zavřete</p>
        </div>
      )}
    </div>
  );
}
