import type { MetadataRoute } from "next";
import { SITE_URL } from "./config/site.ts";

// Moderátorské a účastnické URL jsou noindex přímo v metadatech (viz
// [publicCode]/page.tsx a m/[moderatorToken]/page.tsx) — disallow tady je
// jen extra pojistka, aby /m/ crawler ani nezkoušel procházet.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: "/m/",
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
