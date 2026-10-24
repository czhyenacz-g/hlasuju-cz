import type { Metadata } from "next";
import { SITE_NAME, SITE_URL } from "../../app/config/site.ts";
import type { SharePreview } from "./find-poll.ts";

// Účastnické URL jsou noindex (uživatelský obsah, dočasné) — Facebook a
// další služby si Open Graph náhled načtou i tak, noindex jim nevadí.
const NOINDEX = { index: false, follow: false } as const;

/**
 * Metadata stránky /<kód>. Veřejná anketa: vlastní Open Graph (otázka,
 * výzva, dynamický obrázek s ?v=verze pro cache). Živé hlasování: obecná
 * metadata — jeho otázky jsou před spuštěním tajné.
 */
export function pollPageMetadata(publicCode: string, preview: SharePreview | null): Metadata {
  if (!preview) return { title: "Hlasování", robots: NOINDEX };

  const url = `${SITE_URL}/${publicCode}`;
  const intro = preview.closed ? "Anketa je ukončená – podívejte se na výsledky." : "Zahlasujte v anketě – stačí jedno kliknutí, bez registrace.";
  const description = preview.title ? `${preview.title} · ${intro}` : intro;
  const image = { url: `${SITE_URL}/og/${publicCode}?v=${preview.version}`, width: 1200, height: 630, alt: preview.question };
  return {
    title: preview.question,
    description,
    robots: NOINDEX,
    alternates: { canonical: url },
    openGraph: { type: "website", url, siteName: SITE_NAME, locale: "cs_CZ", title: preview.question, description, images: [image] },
    twitter: { card: "summary_large_image", title: preview.question, description, images: [image.url] },
  };
}
