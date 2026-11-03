/** Kruhový odpočet sekund; poslední 3 sekundy červeně. 0 = „Čas!“. */
export default function CountdownBadge({ seconds, className = "" }: { seconds: number; className?: string }) {
  const urgent = seconds <= 3;
  return (
    <span
      role="timer"
      aria-live="off"
      aria-label={seconds > 0 ? `Zbývá ${seconds} s` : "Čas vypršel"}
      className={`inline-flex items-center justify-center rounded-full font-bold tabular-nums text-white shadow-soft transition-colors ${
        urgent ? "bg-red-600" : "bg-brand"
      } ${className}`}
    >
      {seconds > 0 ? seconds : "Čas!"}
    </span>
  );
}
