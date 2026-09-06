// Obsah affiliate banneru odděleně od JSX (components/AlphegaAffiliateBanner.tsx)
// — až bude potřeba změnit inzerenta, text, CTA, URL nebo `d2` tracking,
// stačí upravit tenhle objekt, žádný zásah do komponenty ani do stránek,
// které ji používají.
//
// URL je zkopírovaná přesně tak, jak byla zadaná (Dognet affiliate
// redirect na Alphega akce) — nijak se dál neupravuje ani nedekóduje.
export const ALPHEGA_BANNER = {
  advertiser: "Alphega lékárna",
  headline: "Nestíháte z konference do lékárny?",
  subtext: "Objednejte si vše potřebné pohodlně online.",
  /** CTA text pro variant="standard". */
  cta: "Navštívit Alphega lékárnu →",
  /** Kratší CTA pro variant="compact" (zadání má pro compact vlastní, stručnější znění). */
  compactCta: "Alphega lékárna online →",
  badge: "Partnerský odkaz",
  href: "https://go.dognet.com/?chid=pc9vpU3V&d1=hlasuju&d2=main&url=https%3A%2F%2Fwww.alphega.cz%2Fakce",
} as const;
