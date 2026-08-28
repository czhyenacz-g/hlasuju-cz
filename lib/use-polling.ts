"use client";

import { useEffect, useRef, useState } from "react";

const DEFAULT_INTERVAL_MS = 2500;

/**
 * Jednoduchý polling hook — žádné WebSockets, žádná realtime
 * infrastruktura (viz zadání "preferuj jednoduchost a robustnost").
 * Fetchuje `fetcher()` hned při mountu a pak v pravidelném intervalu.
 * `AbortController` per-request zajistí, že pomalá/zaseknutá odpověď
 * nikdy nepřepíše novější stav (žádné race condition mezi ticky).
 */
export function usePolling<T>(fetcher: (signal: AbortSignal) => Promise<T>, intervalMs = DEFAULT_INTERVAL_MS) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    let cancelled = false;
    let controller: AbortController | null = null;

    async function tick() {
      controller = new AbortController();
      try {
        const result = await fetcherRef.current(controller.signal);
        if (!cancelled) {
          setData(result);
          setError(null);
        }
      } catch (err) {
        if (!cancelled && !(err instanceof DOMException && err.name === "AbortError")) {
          setError(err instanceof Error ? err.message : "Nepodařilo se načíst data.");
        }
      }
    }

    tick();
    const id = setInterval(tick, intervalMs);

    return () => {
      cancelled = true;
      controller?.abort();
      clearInterval(id);
    };
  }, [intervalMs]);

  return { data, error };
}
