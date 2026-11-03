"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Odpočet otázky na klientu. Server posílá `remainingMs` podle svých hodin
 * (viz remainingMsColumn), klient si z něj spočítá konec podle vlastních
 * hodin — rozdíl hodin telefonu a serveru tak nehraje roli. Konec se drží
 * pro danou otázku stabilní; další odpovědi pollingu ho posunou jen při
 * větší odchylce (znovuotevření otázky = nový odpočet).
 *
 * Vrací zbývající celé sekundy (zaokrouhleno nahoru), 0 = čas vypršel,
 * null = otázka odpočet nemá. Rozhoduje vždy server (cast-vote.ts).
 */
export function useCountdown(questionId: number | null, remainingMs: number | null): number | null {
  const deadlineRef = useRef<{ questionId: number; at: number } | null>(null);
  const [now, setNow] = useState(() => Date.now());

  if (questionId === null || remainingMs === null) {
    deadlineRef.current = null;
  } else {
    const at = Date.now() + remainingMs;
    const current = deadlineRef.current;
    if (!current || current.questionId !== questionId || Math.abs(current.at - at) > 1500) {
      deadlineRef.current = { questionId, at };
    }
  }

  const deadline = deadlineRef.current?.at ?? null;
  useEffect(() => {
    if (deadline === null) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [deadline]);

  if (deadline === null) return null;
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}
