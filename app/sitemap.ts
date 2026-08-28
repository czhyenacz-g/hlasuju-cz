import type { MetadataRoute } from "next";
import { SITE_URL } from "./config/site.ts";

// Jen statické stránky — moderátorské (/m/...) a účastnické (/[kód])
// URL do sitemapy nikdy nepatří (viz zadání "moderátorské URL nikdy do
// sitemap"; účastnické URL jsou navíc dynamická/dočasná/noindex).
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: SITE_URL, changeFrequency: "monthly", priority: 1 },
    { url: `${SITE_URL}/vytvorit`, changeFrequency: "monthly", priority: 0.8 },
  ];
}
