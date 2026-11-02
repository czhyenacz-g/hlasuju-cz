/**
 * Logo hlasuju.cz — značka (hlasovací lístek se zatržítkem, stejný motiv
 * jako favicon a OG obrázek) + slovní část. Čisté SVG, bez obrázků.
 */
export default function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <svg viewBox="0 0 32 32" className="h-8 w-8 shrink-0" aria-hidden="true">
        <rect width="32" height="32" rx="9" className="fill-brand" />
        <rect x="8" y="7" width="16" height="18" rx="3" fill="#fff" opacity="0.95" />
        <path d="M11.5 16.5l3 3 6-7" fill="none" className="stroke-brand" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="text-xl font-bold tracking-tight text-gray-900">
        hlasuju<span className="text-brand">.cz</span>
      </span>
    </span>
  );
}
