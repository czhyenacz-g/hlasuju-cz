"use client";

import { Analytics } from "@vercel/analytics/next";

// Moderátorský token je v URL (/m/<token>) jediná "autentizace" — do
// analytiky ho neposíláme, cesta se nahradí zástupným textem.
export default function SiteAnalytics() {
  return <Analytics beforeSend={(event) => ({ ...event, url: event.url.replace(/\/m\/[^/?#]+/, "/m/[token]") })} />;
}
