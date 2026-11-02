import type { MetadataRoute } from "next";
import { SITE_URL } from "./config/site.ts";
import { COMPARISON_LAST_MODIFIED } from "../components/comparison/ComparisonPage.tsx";

// Jen statické stránky — moderátorské (/m/...) a účastnické (/[kód])
// URL do sitemapy nikdy nepatří (viz zadání "moderátorské URL nikdy do
// sitemap"; účastnické URL jsou navíc dynamická/dočasná/noindex).
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: SITE_URL, changeFrequency: "monthly", priority: 1 },
    { url: `${SITE_URL}/vytvorit`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/pro-weby`, changeFrequency: "monthly", priority: 0.8 },
    // Srovnávací stránky: lastModified = datum poslední úpravy obsahu
    // (ComparisonPage.tsx), ne datum požadavku.
    ...["/srovnani", "/alternativa-mentimeter", "/alternativa-slido", "/alternativa-kahoot"].map((path) => ({
      url: `${SITE_URL}${path}`,
      lastModified: COMPARISON_LAST_MODIFIED,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
  ];
}
