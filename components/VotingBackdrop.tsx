// Jemné dekorativní pozadí s volební tematikou (lístek se zaškrtnutím,
// kartičky A/B/C, urna). Čisté inline SVG, žádné obrázky ani JS — nic
// nenačítá a nezpomaluje. Na mobilu skryté, aby nerušilo; na projektoru
// (PresentationView) se nepoužívá vůbec.
export default function VotingBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 hidden overflow-hidden sm:block">
      <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-brand-light/70 blur-3xl" />
      <div className="absolute -right-24 top-1/3 h-80 w-80 rounded-full bg-pastel-blue/80 blur-3xl" />
      <div className="absolute -bottom-32 left-1/4 h-80 w-80 rounded-full bg-pastel-green/80 blur-3xl" />

      <svg className="absolute left-[6%] top-[14%] h-28 w-24 -rotate-6 text-brand-soft opacity-[0.18]" viewBox="0 0 48 56" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="4" width="40" height="48" rx="5" />
        <rect x="11" y="14" width="8" height="8" rx="2" />
        <path d="M12.5 18l2 2 3.5-4" />
        <path d="M24 18h13M11 30h8M24 30h13M11 40h8M24 40h9" />
      </svg>

      <svg className="absolute right-[8%] top-[10%] h-20 w-36 rotate-3 text-brand-soft opacity-[0.16]" viewBox="0 0 90 48" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="2" y="6" width="24" height="36" rx="6" />
        <rect x="33" y="2" width="24" height="36" rx="6" />
        <rect x="64" y="8" width="24" height="36" rx="6" />
        <text x="14" y="30" textAnchor="middle" fontSize="14" fontWeight="700" fill="currentColor" stroke="none">A</text>
        <text x="45" y="26" textAnchor="middle" fontSize="14" fontWeight="700" fill="currentColor" stroke="none">B</text>
        <text x="76" y="32" textAnchor="middle" fontSize="14" fontWeight="700" fill="currentColor" stroke="none">C</text>
      </svg>

      <svg className="absolute bottom-[10%] right-[12%] h-28 w-28 text-brand-soft opacity-[0.16]" viewBox="0 0 56 56" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 8h16v14H20z" />
        <path d="M24 13h8" />
        <path d="M8 24h40v26a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2z" />
        <path d="M18 24h20" strokeWidth="3" />
      </svg>

      <svg className="absolute bottom-[18%] left-[10%] h-12 w-12 rotate-12 text-brand-soft opacity-[0.2]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="5" />
        <path d="M8 12.5l3 3 5-6" />
      </svg>
    </div>
  );
}
