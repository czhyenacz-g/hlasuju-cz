"use client";

import { useEffect, useRef, useState } from "react";
import QrCode from "../../../components/QrCode.tsx";
import QuestionImage from "../../../components/QuestionImage.tsx";
import QuestionLink from "../../../components/QuestionLink.tsx";
import ResultsBarChart from "../../../components/ResultsBarChart.tsx";
import SlideBody from "../../../components/SlideBody.tsx";
import { LIMITS } from "../../../lib/polls/limits.ts";
import { confirmReopen, type ModeratorAction } from "./QuestionControls.tsx";
import type { ModeratorPollView, ModeratorQuestionView } from "../../../lib/polls/types.ts";

const LETTERS = "ABCDEFGHIJ";

function formatCode(code: string) {
  return `${code.slice(0, 3)} ${code.slice(3)}`;
}

function isInteractive(target: EventTarget | null) {
  return target instanceof HTMLElement && Boolean(target.closest("button, a, input, textarea, select"));
}

function isTyping(target: EventTarget | null) {
  return target instanceof HTMLElement && (target.isContentEditable || Boolean(target.closest("input, textarea, select")));
}

function respondedLabel(count: number) {
  if (count === 1) return "Odpověděl 1 účastník";
  return count >= 2 && count <= 4 ? `Odpověděli ${count} účastníci` : `Odpovědělo ${count} účastníků`;
}

function answersLabel(count: number) {
  if (count === 1) return "1 odpověď";
  return count >= 2 && count <= 4 ? `${count} odpovědi` : `${count} odpovědí`;
}

/**
 * Promítací režim prezentace — celá obrazovka, velké písmo, vysoký kontrast,
 * ovládání jen nenápadně dole. Prezentující používá hlavně „Další“:
 *   → / PageDown / mezerník / Enter … další slajd
 *   ← / PageUp … předchozí slajd
 *   R … výsledky otázky, Q … QR kód, F … celá obrazovka, Esc … zpět do řízení
 * Přechod řeší server (navigate-slide.ts): odchodem z otázky se odpovídání
 * uzavře, prvním vstupem na neodehranou otázku se otevře. Návrat na
 * odehranou otázku ji znovu neotevře (jen tlačítko „Znovu otevřít“).
 * Zkratky nereagují při psaní do textového pole.
 */
export default function PresentationView({
  poll,
  slide,
  slideIndex,
  publicUrl,
  pending,
  error,
  onNavigate,
  onAction,
  onClose,
}: {
  poll: ModeratorPollView;
  slide: ModeratorQuestionView;
  slideIndex: number;
  publicUrl: string;
  pending: boolean;
  error: string | null;
  onNavigate: (slideId: number) => void;
  onAction: (action: ModeratorAction, questionId?: number) => void;
  onClose: () => void;
}) {
  const [resultsOverride, setResultsOverride] = useState<{ slideId: number; visible: boolean } | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [leaderboardPage, setLeaderboardPage] = useState<{ slideId: number; page: number }>({ slideId: slide.id, page: 0 });
  const page = leaderboardPage.slideId === slide.id ? leaderboardPage.page : 0;

  const isQuestion = slide.kind === "question";
  const showResults = resultsOverride?.slideId === slide.id ? resultsOverride.visible : slide.status === "ended";

  const previous = poll.questions[slideIndex - 1];
  const next = poll.questions[slideIndex + 1];

  // Aktuální hodnoty pro klávesové zkratky bez znovuregistrace listeneru.
  const stateRef = useRef({ slide, previous, next, pending, showResults, showQr });
  stateRef.current = { slide, previous, next, pending, showResults, showQr };

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.altKey || event.ctrlKey || event.metaKey || isTyping(event.target)) return;
      const { slide: current, previous: before, next: following, pending: busy, showResults: visible } = stateRef.current;
      switch (event.key) {
        case " ":
        case "Enter":
          // Zaměřené tlačítko si mezerník/Enter obslouží samo (jinak dvojí akce).
          if (isInteractive(event.target)) return;
          event.preventDefault();
          if (following && !busy) onNavigate(following.id);
          break;
        case "ArrowRight":
        case "PageDown":
          event.preventDefault();
          if (following && !busy) onNavigate(following.id);
          break;
        case "ArrowLeft":
        case "PageUp":
          event.preventDefault();
          if (before && !busy) onNavigate(before.id);
          break;
        case "r":
        case "R":
          if (current.kind === "question") setResultsOverride({ slideId: current.id, visible: !visible });
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
  }, [onNavigate, onClose]);

  function toggleFullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen?.();
    else void document.documentElement.requestFullscreen?.().catch(() => {});
  }

  const leaderboardPages = slide.leaderboard ? Math.max(1, Math.ceil(slide.leaderboard.entries.length / LIMITS.LEADERBOARD_PAGE_SIZE)) : 1;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white text-gray-900">
      {poll.backgroundImage && (
        // Pozadí celé prezentace — pod bílým závojem, aby text i grafy
        // zůstaly čitelné i na slabém projektoru.
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          {/* eslint-disable-next-line @next/next/no-img-element -- obrázek z Content API, jen dekorace */}
          <img src={poll.backgroundImage.url} alt="" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-white/[0.78]" />
        </div>
      )}
      <header className="relative flex shrink-0 flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-gray-100 px-6 py-3 lg:px-12">
        <p className="text-lg text-gray-600 lg:text-2xl">
          Hlasujte na <span className="font-bold text-gray-900">hlasuju.cz</span> · kód{" "}
          <span className="font-bold tracking-widest text-brand">{formatCode(poll.publicCode)}</span>
        </p>
        <p className="text-base font-semibold text-gray-500 lg:text-xl">
          {slideIndex + 1} / {poll.questions.length}
          {isQuestion && slide.status === "active" && <span className="ml-3 text-green-700">● odpovídá se</span>}
          {isQuestion && slide.status === "ended" && <span className="ml-3 text-gray-500">odpovídání ukončeno</span>}
        </p>
      </header>

      <main className="relative flex min-h-0 flex-1 flex-col overflow-y-auto px-6 py-5 lg:px-12 lg:py-6">
        {slide.kind === "question" && <QuestionSlide slide={slide} showResults={showResults} />}
        {slide.kind === "content" && <ContentSlide slide={slide} />}
        {slide.kind === "results" && <ResultsSlide slide={slide} poll={poll} />}
        {slide.kind === "leaderboard" && <LeaderboardSlide slide={slide} page={page} />}
      </main>

      <footer className="relative flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-gray-100 px-6 py-3 lg:px-12">
        <p className="text-xl font-semibold text-gray-700 lg:text-2xl">
          {isQuestion
            ? slide.status === "prepared"
              ? "Odpovídání se otevře po zobrazení"
              : `${slide.status === "active" ? "Přijato" : "Celkem"}: ${answersLabel(slide.totalVotes)}`
            : !next
              ? "Konec prezentace"
              : ""}
        </p>
        {/* Ovládání je záměrně tlumené — v promítání nemá rušit. */}
        <div className="flex flex-wrap items-center gap-2 opacity-60 transition hover:opacity-100 focus-within:opacity-100">
          {error && <span className="mr-2 text-sm text-red-600">{error}</span>}
          {isQuestion && slide.status === "active" && (
            <button
              type="button"
              onClick={() => onAction("close", slide.id)}
              disabled={pending}
              className="rounded-xl border border-gray-300 px-3 py-2 text-sm font-semibold disabled:opacity-50"
              title="Uzavřít odpovídání bez přechodu na další slajd"
            >
              ■ Ukončit odpovídání
            </button>
          )}
          {isQuestion && slide.status === "ended" && (
            <button
              type="button"
              onClick={() => confirmReopen() && onAction("activate", slide.id)}
              disabled={pending}
              className="rounded-xl border border-gray-300 px-3 py-2 text-sm font-semibold disabled:opacity-50"
              title="Znovu otevřít odpovídání (dosavadní odpovědi zůstanou)"
            >
              ↺ Znovu otevřít
            </button>
          )}
          {isQuestion && (
            <button
              type="button"
              onClick={() => setResultsOverride({ slideId: slide.id, visible: !showResults })}
              className="rounded-xl border border-gray-300 px-3 py-2 text-sm font-semibold"
              title="Zobrazit/skrýt výsledky (R)"
            >
              {showResults ? "Skrýt výsledky" : "Výsledky"}
            </button>
          )}
          {slide.kind === "leaderboard" && leaderboardPages > 1 && (
            <button
              type="button"
              onClick={() => setLeaderboardPage({ slideId: slide.id, page: (page + 1) % leaderboardPages })}
              className="rounded-xl border border-gray-300 px-3 py-2 text-sm font-semibold"
              title="Další místa žebříčku"
            >
              {page + 1 < leaderboardPages ? `Další místa (${page + 2}/${leaderboardPages}) ↓` : "Zpět na první místa ↑"}
            </button>
          )}
          <button type="button" onClick={() => setShowQr(true)} className="rounded-xl border border-gray-300 px-3 py-2 text-sm font-semibold" title="QR kód (Q)">
            QR
          </button>
          <button type="button" onClick={toggleFullscreen} className="rounded-xl border border-gray-300 px-3 py-2 text-sm font-semibold" title="Celá obrazovka (F)">
            Celá obrazovka
          </button>
          <button type="button" onClick={onClose} className="rounded-xl border border-gray-300 px-3 py-2 text-sm font-semibold" title="Zpět do řízení (Esc)">
            Zavřít
          </button>
          <button
            type="button"
            onClick={() => previous && onNavigate(previous.id)}
            disabled={!previous || pending}
            className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold disabled:opacity-30"
            title="Předchozí slajd (←)"
          >
            ← Zpět
          </button>
          <button
            type="button"
            onClick={() => next && onNavigate(next.id)}
            disabled={!next || pending}
            className="rounded-xl bg-brand px-5 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-30"
            title={isQuestion && slide.status === "active" ? "Uzavřít odpovídání a pokračovat (→, mezerník)" : "Další slajd (→, mezerník)"}
          >
            Další →
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

function QuestionSlide({ slide, showResults }: { slide: ModeratorQuestionView; showResults: boolean }) {
  const linkVisible = slide.link && (slide.status === "ended" || slide.link.showDuringVoting);
  return (
    <>
      <h1 className={`text-3xl font-bold leading-tight ${slide.image ? "lg:text-4xl xl:text-5xl" : "lg:text-5xl"}`}>{slide.text}</h1>
      <div
        className={`mt-5 flex-1 ${
          slide.image
            ? // S obrázkem: obrázek ~65 % šířky, odpovědi ~35 % (s výsledky
              // ~60/40 — pruhy a procenta potřebují víc místa). Výška obrázku
              // = zbytek obrazovky po hlavičce, nadpisu a patičce (max. 70vh).
              `grid items-center gap-6 lg:mt-4 lg:gap-8 ${
                showResults ? "lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]" : "lg:grid-cols-[minmax(0,1.85fr)_minmax(0,1fr)]"
              }`
            : "flex flex-col justify-center lg:mt-6"
        }`}
      >
        {slide.image && (
          <>
            <QuestionImage image={slide.image} maxHeightClass="max-h-[55vh]" className="lg:hidden" priority />
            <QuestionImage image={slide.image} fitHeight="min(70vh, 100vh - 16rem)" className="hidden lg:block" priority />
          </>
        )}

        <div className="flex min-w-0 flex-col gap-6">
          {showResults ? (
            <>
              <ResultsBarChart
                options={slide.options}
                totalVotes={slide.totalVotes}
                // Vyhodnocení až po uzavření otázky — během odpovídání (i po
                // znovuotevření) se správná odpověď na plátně neukáže.
                correctOptionId={slide.status === "ended" ? slide.correctOptionId : null}
                large
              />
              <FastestList fastest={slide.fastest} />
            </>
          ) : (
            <ol className="flex flex-col gap-3 lg:gap-4">
              {slide.options.map((option, index) => (
                <li key={option.id} className="flex items-center gap-4 rounded-2xl border-2 border-gray-200 bg-white/80 px-5 py-3 lg:px-6 lg:py-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand text-xl font-bold text-white lg:h-12 lg:w-12 lg:text-2xl">
                    {LETTERS[index]}
                  </span>
                  <span className={`min-w-0 break-words text-2xl font-medium ${slide.image ? "lg:text-3xl" : "lg:text-4xl"}`}>{option.text}</span>
                </li>
              ))}
            </ol>
          )}
          {linkVisible && slide.link && <QuestionLink link={slide.link} large />}
        </div>
      </div>
    </>
  );
}

/** Rozložení podle vyplněných polí: nadpis / nadpis + text / + obrázek / obrázek s nadpisem. */
function ContentSlide({ slide }: { slide: ModeratorQuestionView }) {
  const title = slide.text.trim();
  const body = slide.body?.trim() ?? "";

  if (slide.image && !body) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-5">
        {title && <h1 className="text-center text-4xl font-bold leading-tight lg:text-6xl">{title}</h1>}
        <QuestionImage image={slide.image} fitHeight={title ? "min(68vh, 100vh - 18rem)" : "min(78vh, 100vh - 10rem)"} className="w-full" priority />
      </div>
    );
  }

  if (slide.image) {
    return (
      <div className="flex flex-1 flex-col justify-center gap-6">
        {title && <h1 className="text-4xl font-bold leading-tight lg:text-5xl xl:text-6xl">{title}</h1>}
        <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <SlideBody text={body} className="text-2xl leading-snug text-gray-800 lg:text-3xl xl:text-4xl" />
          <QuestionImage image={slide.image} fitHeight="min(66vh, 100vh - 18rem)" priority />
        </div>
      </div>
    );
  }

  if (!body) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <h1 className="max-w-6xl text-center text-5xl font-bold leading-tight lg:text-7xl">{title}</h1>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center gap-6 lg:gap-8">
      {title && <h1 className="text-4xl font-bold leading-tight lg:text-6xl">{title}</h1>}
      <SlideBody text={body} className="text-2xl leading-snug text-gray-800 lg:text-4xl" />
    </div>
  );
}

function ResultsSlide({ slide, poll }: { slide: ModeratorQuestionView; poll: ModeratorPollView }) {
  const question = poll.questions.find((q) => q.id === slide.resultsQuestionId && q.kind === "question");
  const heading = slide.text.trim() || question?.text || "Výsledky";

  let content;
  if (!question) {
    content = <EmptyState title="Chybí otázka" message="Tento slajd nemá vybranou otázku. Vyberte ji v úpravách prezentace." />;
  } else if (question.status === "prepared") {
    content = <EmptyState title="Otázka zatím nezazněla" message="Výsledky se ukážou, až se na otázku odpovídá." />;
  } else if (question.totalVotes === 0) {
    content = <EmptyState title="Zatím bez odpovědí" message="Na tuto otázku nikdo neodpověděl." />;
  } else {
    content = (
      <div className="flex flex-col gap-4">
        <ResultsBarChart
          options={question.options}
          totalVotes={question.totalVotes}
          correctOptionId={question.status === "ended" ? question.correctOptionId : null}
          large
        />
        <FastestList fastest={question.fastest} />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6">
      <div>
        <p className="text-lg font-semibold uppercase tracking-wide text-brand lg:text-xl">Výsledky</p>
        <h1 className="mt-1 text-3xl font-bold leading-tight lg:text-5xl">{heading}</h1>
        {question && question.status !== "prepared" && (
          <p className="mt-2 text-xl text-gray-600 lg:text-2xl">
            {respondedLabel(question.totalVotes)}
            {question.status === "active" && " · odpovídání ještě běží"}
          </p>
        )}
      </div>
      <div className="flex flex-1 flex-col justify-center">{content}</div>
    </div>
  );
}

/** Bonus za rychlost: kdo odpověděl správně nejrychleji (jen po uzavření otázky). */
function FastestList({ fastest }: { fastest: ModeratorQuestionView["fastest"] }) {
  if (!fastest || fastest.length === 0) return null;
  return (
    <p className="flex flex-wrap items-center gap-x-5 gap-y-1 text-lg text-gray-700 lg:text-2xl">
      <span className="font-semibold text-amber-700">⚡ Nejrychlejší správně:</span>
      {fastest.map((entry, index) => (
        <span key={index}>
          {index + 1}. <span className="font-semibold text-gray-900">{entry.label}</span>{" "}
          <span className="text-amber-700">+{entry.bonus}</span>
        </span>
      ))}
    </p>
  );
}

function LeaderboardSlide({ slide, page }: { slide: ModeratorQuestionView; page: number }) {
  const board = slide.leaderboard;
  const heading = slide.text.trim() || "Průběžné pořadí";
  const entries = board?.entries.slice(page * LIMITS.LEADERBOARD_PAGE_SIZE, (page + 1) * LIMITS.LEADERBOARD_PAGE_SIZE) ?? [];
  const rest = (board?.entries.length ?? 0) - (page + 1) * LIMITS.LEADERBOARD_PAGE_SIZE;

  let content;
  if (!board || board.scoredQuestionsTotal === 0) {
    content = <EmptyState title="Bez bodovaných otázek" message="Před tímto slajdem není žádná otázka se správnou odpovědí, body se nepočítají." />;
  } else if (board.entries.length === 0) {
    content = <EmptyState title="Zatím nikdo neodpověděl" message="Pořadí se ukáže, jakmile účastníci odpovědí na bodované otázky." />;
  } else {
    content = (
      // Velikost řádků podle výšky obrazovky — prvních 10 míst se vejde
      // bez posouvání i na projektor 1280×720.
      <ol className="grid gap-[0.8vh] text-[clamp(1.25rem,3.4vh,2.25rem)]">
        {entries.map((entry) => (
          <li
            key={`${entry.rank}-${entry.label}`}
            className={`flex items-center gap-4 rounded-2xl px-5 py-[0.6vh] leading-tight lg:px-6 ${entry.rank <= 3 ? "bg-brand-light" : "bg-gray-50"}`}
          >
            <span className="w-[4.2em] shrink-0 font-bold text-brand-dark">
              {entry.rank}.{entry.tied && <span className="ml-1 align-middle text-[0.5em] font-semibold text-gray-500">shoda</span>}
            </span>
            <span className="min-w-0 flex-1 truncate font-semibold">{entry.label}</span>
            <span className="shrink-0 font-bold tabular-nums">
              {entry.points} <span className="text-[0.65em] font-medium text-gray-500">b.</span>
            </span>
          </li>
        ))}
      </ol>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-[1.5vh]">
      <div>
        <h1 className="text-[clamp(2rem,6.5vh,3.75rem)] font-bold leading-tight">{heading}</h1>
        {board && board.scoredQuestionsTotal > 0 && (
          <p className="mt-1 text-[clamp(1rem,2.4vh,1.5rem)] text-gray-600">
            Bodované otázky: {board.scoredQuestions} z {board.scoredQuestionsTotal} · max. {board.maxPoints} b.
            {board.entries.length > LIMITS.LEADERBOARD_PAGE_SIZE && ` · účastníků: ${board.entries.length}`}
          </p>
        )}
      </div>
      <div className="flex flex-1 flex-col justify-center">{content}</div>
      {rest > 0 && <p className="text-center text-lg text-gray-500">… a dalších {rest} účastníků</p>}
    </div>
  );
}

function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <div className="mx-auto max-w-3xl rounded-3xl border-2 border-dashed border-gray-200 px-8 py-10 text-center">
      <p className="text-3xl font-bold text-gray-800 lg:text-4xl">{title}</p>
      <p className="mt-3 text-xl text-gray-600 lg:text-2xl">{message}</p>
    </div>
  );
}
