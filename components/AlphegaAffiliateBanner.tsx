import { ALPHEGA_BANNER } from "../lib/ads/alphega-banner.ts";

type AlphegaAffiliateBannerProps = {
  /**
   * "compact" = velmi decentní jednořádková karta bez pozadí navíc,
   * použij během aktivního hlasování / na jinak "úkolových" obrazovkách.
   * "standard" = o něco výraznější informační karta, použij na homepage,
   * po dokončení hlasování, na výsledcích a dalších informačních stránkách.
   */
  variant?: "compact" | "standard";
  className?: string;
};

// Jedna znovupoužitelná affiliate banner komponenta pro Alphega lékárnu,
// zapojená centrálně z jednotlivých stránek (ne globálně v root layoutu
// — umístění/varianta se liší podle kontextu stránky, viz zadání).
// Vizuálně navazuje na stávající design (rounded karty, border-gray-200,
// brand akcent, stejné hover/focus stavy jako zbytek appky) — žádný
// cizí reklamní blok, žádný obrázek, žádný gradient.
//
// Text/CTA/URL/d2 jsou schválně v lib/ads/alphega-banner.ts, ne natvrdo
// tady — výměna inzerenta nebo úprava kopie později nevyžaduje zásah do
// JSX ani do stránek, které komponentu používají.
export default function AlphegaAffiliateBanner({ variant = "standard", className = "" }: AlphegaAffiliateBannerProps) {
  const ad = ALPHEGA_BANNER;

  if (variant === "compact") {
    return (
      <a
        href={ad.href}
        target="_blank"
        rel="sponsored noopener noreferrer"
        className={`block rounded-xl border border-gray-200 bg-white/60 px-4 py-3 text-sm transition hover:border-brand/40 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/20 ${className}`}
      >
        <p className="text-gray-600">{ad.headline}</p>
        <p className="mt-0.5 font-semibold text-brand">{ad.compactCta}</p>
        <p className="mt-1 text-[10px] uppercase tracking-wide text-gray-400">{ad.badge}</p>
      </a>
    );
  }

  // Záměrně tlumená: bez výrazného CTA tlačítka, menší písmo — nesmí
  // soupeřit s hlavními akcemi stránky (připojit se / vytvořit).
  return (
    <a
      href={ad.href}
      target="_blank"
      rel="sponsored noopener noreferrer"
      className={`block rounded-2xl border border-gray-200 bg-white/60 px-5 py-4 transition hover:border-brand/30 hover:bg-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/20 ${className}`}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <div>
          <p className="text-sm font-semibold text-gray-800">{ad.headline}</p>
          <p className="mt-0.5 text-sm text-gray-600">{ad.subtext}</p>
        </div>
        <span className="inline-flex min-h-[44px] shrink-0 items-center text-sm font-semibold text-brand">{ad.cta}</span>
      </div>
      <p className="mt-2 text-[10px] uppercase tracking-wide text-gray-400">{ad.badge}</p>
    </a>
  );
}
