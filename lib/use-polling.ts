"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const DEFAULT_INTERVAL_MS = 2500;

/**
 * Jednoduchý polling hook — žádné WebSockets, žádná realtime
 * infrastruktura (viz zadání "preferuj jednoduchost a robustnost").
 * Fetchuje `fetcher()` hned při mountu a pak v pravidelném intervalu.
 * Pořadové číslo požadavku zajistí, že pomalá/zaseknutá odpověď nikdy
 * nepřepíše novější stav (žádné race condition mezi ticky); AbortController
 * jen ukončí rozběhnutý požadavek při odchodu ze stránky.
 * `refresh()` načte stav hned (např. po akci moderátora), bez čekání na tick.
 */
export function usePolling<T>(fetcher: (signal: AbortSignal) => Promise<T>, intervalMs = DEFAULT_INTERVAL_MS) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const refreshRef = useRef<() => void>(() => {});

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    let lastRequest = 0;
    let lastApplied = 0;

    async function tick() {
      const request = ++lastRequest;
      try {
        const result = await fetcherRef.current(controller.signal);
        if (!cancelled && request > lastApplied) {
          lastApplied = request;
          setData(result);
          setError(null);
        }
      } catch (err) {
        if (!cancelled && request > lastApplied && !(err instanceof DOMException && err.name === "AbortError")) {
          setError(err instanceof Error ? err.message : "Nepodařilo se načíst data.");
        }
      }
    }

    refreshRef.current = () => void tick();
    tick();
    const id = setInterval(tick, intervalMs);

    return () => {
      cancelled = true;
      controller.abort();
      clearInterval(id);
    };
  }, [intervalMs]);

  const refresh = useCallback(() => refreshRef.current(), []);

  return { data, error, refresh };
}
