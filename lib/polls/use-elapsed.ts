"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Počítadlo uplynulého času slajdu na klientu. Server posílá uplynulé ms
 * podle svých hodin (timerColumns), klient si z nich spočítá začátek podle
 * vlastních hodin a zobrazuje skutečný rozdíl (ne přičítání po sekundě,
 * takže se nezpožďuje ani při vytíženém prohlížeči). Začátek se drží
 * stabilní; polling ho posune jen při větší odchylce (nové zobrazení
 * slajdu = nové počítání). Když počítadlo stojí (otázka uzavřená),
 * platí hodnota ze serveru.
 *
 * Vrací celé uplynulé sekundy, null = slajd čas nezobrazuje.
 */
export function useElapsedSeconds(slideId: number, timer: { elapsedMs: number; running: boolean } | null): number | null {
  const startRef = useRef<{ slideId: number; at: number } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const running = timer?.running === true;

  if (!timer || !running) {
    startRef.current = null;
  } else {
    const at = Date.now() - timer.elapsedMs;
    const current = startRef.current;
    if (!current || current.slideId !== slideId || Math.abs(current.at - at) > 1500) {
      startRef.current = { slideId, at };
    }
  }

  const start = startRef.current?.at ?? null;
  useEffect(() => {
    if (start === null) return;
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(interval);
  }, [start]);

  if (!timer) return null;
  const elapsedMs = start === null ? timer.elapsedMs : now - start;
  return Math.max(0, Math.floor(elapsedMs / 1000));
}
