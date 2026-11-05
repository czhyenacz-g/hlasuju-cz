import type { MetadataRoute } from "next";
import { SITE_URL } from "./config/site.ts";
import { COMPARISON_LAST_MODIFIED } from "../components/comparison/ComparisonPage.tsx";
import { REFERENCE_LAST_MODIFIED } from "../components/reference/ReferenceShell.tsx";

// Jen obsahové stránky (úvod, pro weby, srovnání, reference). Formulář
// /vytvorit ani moderátorské (/m/...) a účastnické (/[kód])
// URL do sitemapy nikdy nepatří (viz zadání "moderátorské URL nikdy do
// sitemap"; účastnické URL jsou navíc dynamická/dočasná/noindex).
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: SITE_URL, changeFrequency: "monthly", priority: 1 },
    { url: `${SITE_URL}/pro-weby`, changeFrequency: "monthly", priority: 0.8 },
    // Srovnávací stránky: lastModified = datum poslední úpravy obsahu
    // (ComparisonPage.tsx), ne datum požadavku.
    ...["/srovnani", "/alternativa-mentimeter", "/alternativa-slido", "/alternativa-kahoot"].map((path) => ({
      url: `${SITE_URL}${path}`,
      lastModified: COMPARISON_LAST_MODIFIED,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
    // Reference: lastModified = poslední úprava obsahu (ReferenceShell.tsx).
    ...["/reference", "/reference/parako-2026"].map((path) => ({
      url: `${SITE_URL}${path}`,
      lastModified: REFERENCE_LAST_MODIFIED,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
  ];
}
