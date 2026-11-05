import { ImageResponse } from "next/og";

/**
 * Ikona aplikace — stejný motiv jako logo (components/Logo.tsx):
 * hlasovací lístek se zatržítkem na fialovém (brand) pozadí. Čisté SVG,
 * žádný font ani externí obrázek.
 *
 * - `rounded`: zaoblené rohy (favicon). Apple a maskovatelné ikony
 *   zaoblení nechtějí — tvar si ořízne systém.
 * - `maskable`: motiv zmenšený do bezpečné zóny (vnitřních 80 %).
 */
export function appIconResponse(size: number, { rounded = false, maskable = false }: { rounded?: boolean; maskable?: boolean } = {}) {
  const glyph = Math.round(size * (maskable ? 0.5 : 0.68));
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#6558B4",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: rounded ? Math.round(size * 0.28) : 0,
        }}
      >
        {/* Lístek 16 × 18 jako v logu — šířka podle poměru stran. */}
        <svg width={Math.round((glyph * 16) / 18)} height={glyph} viewBox="8 7 16 18">
          <rect x="8" y="7" width="16" height="18" rx="3" fill="#ffffff" />
          <path d="M11.5 16.5l3 3 6-7" fill="none" stroke="#6558B4" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    ),
    { width: size, height: size }
  );
}
