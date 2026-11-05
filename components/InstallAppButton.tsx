"use client";

import { useEffect, useState } from "react";

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/**
 * Nenápadná nabídka „Nainstalovat aplikaci“ (jen v patičce úvodní
 * stránky). Žádný automatický popup: výchozí nabídku prohlížeče
 * potlačíme a instalaci spustí až klepnutí. V nainstalované aplikaci
 * a v prohlížečích bez podpory se nic nezobrazí. Na iPhonu/iPadu (Safari
 * instalaci přes API neumí) jen krátký návod.
 */
export default function InstallAppButton({ className = "" }: { className?: string }) {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [showIosHint, setShowIosHint] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (standalone) {
      setInstalled(true);
      return;
    }
    // iPadOS se hlásí jako Mac — rozliší ho dotykové ovládání.
    const appleMobile = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    setIos(appleMobile);

    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed || (!prompt && !ios)) return null;

  const buttonClass = `inline-flex min-h-[44px] items-center px-3 underline-offset-4 hover:text-gray-700 hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/20 ${className}`;

  if (prompt) {
    return (
      <button
        type="button"
        className={buttonClass}
        onClick={async () => {
          await prompt.prompt();
          await prompt.userChoice.catch(() => null);
          // Událost jde použít jen jednou; prohlížeč případně pošle novou.
          setPrompt(null);
        }}
      >
        Nainstalovat aplikaci
      </button>
    );
  }

  return (
    <span className="inline-flex flex-col items-center">
      <button type="button" className={buttonClass} aria-expanded={showIosHint} onClick={() => setShowIosHint((value) => !value)}>
        Nainstalovat aplikaci
      </button>
      {showIosHint && (
        <span className="mx-auto max-w-xs px-3 pb-2 text-xs text-gray-600">
          V Safari klepněte na tlačítko Sdílet (čtvereček se šipkou) a vyberte „Přidat na plochu“.
        </span>
      )}
    </span>
  );
}
