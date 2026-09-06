import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ALPHEGA_BANNER } from "../lib/ads/alphega-banner.ts";

function readSource(relPath: string): string {
  return readFileSync(fileURLToPath(new URL(relPath, import.meta.url)), "utf8");
}

describe("lib/ads/alphega-banner.ts — obsah oddělený od JSX", () => {
  test("affiliate URL je přesně ta zadaná, nijak neupravená/dekódovaná", () => {
    assert.equal(
      ALPHEGA_BANNER.href,
      "https://go.dognet.com/?chid=pc9vpU3V&d1=hlasuju&d2=main&url=https%3A%2F%2Fwww.alphega.cz%2Fakce"
    );
  });

  test("obsahuje headline, subtext, cta, compactCta a badge", () => {
    assert.equal(ALPHEGA_BANNER.headline, "Nestíháte z konference do lékárny?");
    assert.equal(ALPHEGA_BANNER.subtext, "Objednejte si vše potřebné pohodlně online.");
    assert.equal(ALPHEGA_BANNER.cta, "Navštívit Alphega lékárnu →");
    assert.equal(ALPHEGA_BANNER.compactCta, "Alphega lékárna online →");
    assert.equal(ALPHEGA_BANNER.badge, "Partnerský odkaz");
  });
});

describe("components/AlphegaAffiliateBanner.tsx", () => {
  const source = readSource("../components/AlphegaAffiliateBanner.tsx");

  test("čte obsah z centrální konstanty, netextuje headline/cta natvrdo v komponentě", () => {
    assert.match(source, /import \{ ALPHEGA_BANNER \} from/);
    assert.doesNotMatch(source, /"Nestíháte z konference do lékárny\?"/);
  });

  test("podporuje variant 'compact' a 'standard'", () => {
    assert.match(source, /variant\?:\s*"compact"\s*\|\s*"standard"/);
  });

  test("affiliate odkaz otevírá v novém tabu se sponsored rel (přesně dle zadání)", () => {
    assert.match(source, /target="_blank"/g);
    const relMatches = source.match(/rel="sponsored noopener noreferrer"/g) ?? [];
    assert.equal(relMatches.length, 2, "obě varianty (compact i standard) musí mít stejný rel");
  });

  test("žádná manipulace s URL (žádný encode/decode/URLSearchParams)", () => {
    assert.doesNotMatch(source, /encodeURIComponent|decodeURIComponent|URLSearchParams/);
  });

  test("žádný obrázek nikde v komponentě (compact ani standard)", () => {
    assert.doesNotMatch(source, /<img|next\/image/);
  });

  test("žádný gradient (projekt gradienty standardně nepoužívá)", () => {
    assert.doesNotMatch(source, /bg-gradient/);
  });

  test("používá existující 'brand' barvu a rounded/border konvence design systému", () => {
    assert.match(source, /text-brand/);
    assert.match(source, /border-gray-200/);
    assert.match(source, /rounded-/);
  });

  test("focus-visible stav pro klávesnicové ovládání", () => {
    assert.match(source, /focus-visible:ring-4 focus-visible:ring-brand\/20/);
  });

  test("CTA má dostatečný touch target na standard variantě (min-h)", () => {
    assert.match(source, /min-h-\[44px\]/);
  });

  test("badge 'Partnerský odkaz' je nenápadný (malý, jemná barva), ne hlavní obsah", () => {
    assert.match(source, /text-\[10px\][^\n]*text-gray-400|text-gray-400[^\n]*text-\[10px\]/);
  });
});

describe("zapojení banneru napříč stránkami", () => {
  test("homepage používá 'standard'", () => {
    const source = readSource("../app/page.tsx");
    assert.match(source, /<AlphegaAffiliateBanner variant="standard" \/>/);
  });

  test("vytvoření hlasování používá decentní 'compact'", () => {
    const source = readSource("../app/vytvorit/page.tsx");
    assert.match(source, /<AlphegaAffiliateBanner variant="compact" \/>/);
  });

  test("moderátorská konzole (aktivní řízení) používá 'compact'", () => {
    const source = readSource("../app/m/[moderatorToken]/ModeratorConsole.tsx");
    const consoleBody = source.slice(0, source.indexOf("function ModeratorFinalSummary"));
    assert.match(consoleBody, /<AlphegaAffiliateBanner variant="compact" \/>/);
  });

  test("finální výsledky moderátora (ModeratorFinalSummary) používají 'standard'", () => {
    const source = readSource("../app/m/[moderatorToken]/ModeratorConsole.tsx");
    const summaryBody = source.slice(source.indexOf("function ModeratorFinalSummary"));
    assert.match(summaryBody, /<AlphegaAffiliateBanner variant="standard" \/>/);
  });

  test("finální výsledky účastníka (FinalResultsSection) používají 'standard'", () => {
    const source = readSource("../app/[publicCode]/PollParticipant.tsx");
    const finalSection = source.slice(source.indexOf("function FinalResultsSection"));
    assert.match(finalSection, /<AlphegaAffiliateBanner variant="standard" \/>/);
  });

  test("compact banner na účastnické stránce se objeví jen ve StateScreen (čekání/po odeslání hlasu), nikdy v aktivní otázce", () => {
    const source = readSource("../app/[publicCode]/PollParticipant.tsx");
    // Unikátní marker uvnitř bloku s aktivní otázkou (tlačítka odpovědí) až po začátek StateScreen.
    const activeQuestionBlock = source.slice(source.indexOf('min-h-[64px]'), source.indexOf("function StateScreen"));
    assert.doesNotMatch(activeQuestionBlock, /AlphegaAffiliateBanner/, "aktivní otázka nesmí mít reklamu nad/mezi odpověďmi");

    const stateScreenBlock = source.slice(source.indexOf("function StateScreen"), source.indexOf("function FinalResultsSection"));
    assert.match(stateScreenBlock, /<AlphegaAffiliateBanner variant="compact" \/>/);

    // Obě StateScreen volání pro "čekání" i "hlas zaznamenán" musí mít showAd.
    assert.match(source, /title="Jste připojeni"[^/]*showAd/s);
    assert.match(source, /title="✓ Hlas byl zaznamenán"[^/]*showAd/s);
  });

  test("žádná stránka nepoužívá zrušené AdBanner/AdSlot komponenty", () => {
    for (const file of [
      "../app/page.tsx",
      "../app/vytvorit/page.tsx",
      "../app/m/[moderatorToken]/ModeratorConsole.tsx",
      "../app/[publicCode]/PollParticipant.tsx",
    ]) {
      const source = readSource(file);
      assert.doesNotMatch(source, /components\/AdBanner|components\/AdSlot/, `${file} pořád importuje zrušenou komponentu`);
    }
  });
});
