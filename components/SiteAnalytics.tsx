"use client";

import { Analytics } from "@vercel/analytics/next";
import Script from "next/script";
import { usePathname } from "next/navigation";

// Moderátorský token je v URL (/m/<token>) jediná "autentizace" — do
// analytiky ho neposíláme, cesta se nahradí zástupným textem.
// Widget vložený na cizích webech (/embed/...) analytiku nemá vůbec:
// neměříme návštěvníky cizích stránek a nespotřebováváme kvótu událostí.
export default function SiteAnalytics({ goatcounterCode }: { goatcounterCode?: string }) {
  const pathname = usePathname();
  if (pathname?.startsWith("/embed/")) return null;
  return (
    <>
      <Analytics beforeSend={(event) => ({ ...event, url: event.url.replace(/\/m\/[^/?#]+/, "/m/[token]") })} />
      {goatcounterCode && (
        <Script data-goatcounter={`https://${goatcounterCode}.goatcounter.com/count`} src="//gc.zgo.at/count.js" strategy="afterInteractive" />
      )}
    </>
  );
}
