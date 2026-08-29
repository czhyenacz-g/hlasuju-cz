const DEFAULT_TITLE = "Chcete podpořit Hlasuju.cz?";
const DEFAULT_SUBTITLE = "Tady může být vaše reklama.";

type AdBannerProps = {
  image?: string;
  href?: string;
  alt?: string;
  title?: string;
  subtitle?: string;
  className?: string;
};

// Reusable reklamní plocha — teď jen vlastní placeholder, ale props jsou
// navržené tak, aby šlo později bez zásahu do stránek vložit skutečný
// banner (obrázek + odkaz, např. Allegro affiliate) — stačí komponentě
// předat `image`/`href`/`alt`. Bez nich se vykreslí placeholder. Žádné
// externí reklamní skripty (AdSense apod.) tu zatím nejsou.
export default function AdBanner({ image, href, alt, title, subtitle, className = "" }: AdBannerProps) {
  const content = image ? (
    // Externí reklamní obrázky (affiliate banery) mohou být z libovolné domény —
    // next/image by vyžadoval dopředu nakonfigurovat remotePatterns.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={image} alt={alt ?? title ?? "Reklama"} className="mx-auto max-h-32 w-auto rounded-xl" />
  ) : (
    <>
      <p className="text-base font-semibold text-gray-700">{title ?? DEFAULT_TITLE}</p>
      <p className="mt-1 text-sm text-gray-500">{subtitle ?? DEFAULT_SUBTITLE}</p>
    </>
  );

  const body = (
    <div className={`rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-6 py-6 text-center ${className}`}>
      <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400">Reklamní prostor</span>
      <div className="mt-2">{content}</div>
    </div>
  );

  if (!href) return body;

  return (
    <a href={href} target="_blank" rel="noopener noreferrer sponsored" className="block transition hover:opacity-90">
      {body}
    </a>
  );
}
