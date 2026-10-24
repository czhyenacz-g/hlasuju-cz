import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { getSharePreview } from "../../../lib/polls/find-poll.ts";

export const runtime = "nodejs";

const WIDTH = 1200;
const HEIGHT = 630;
const OPTION_HEIGHT = 66;

function shorten(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

// Font s českou diakritikou je přibalený (podmnožina DejaVu Sans) —
// výchozí font ImageResponse má jen základní latinku.
let fonts: Promise<{ name: string; data: Buffer; weight: 400 | 700; style: "normal" }[]> | null = null;
function loadFonts() {
  fonts ??= Promise.all([
    readFile(join(process.cwd(), "assets/fonts/DejaVuSans-subset.ttf")),
    readFile(join(process.cwd(), "assets/fonts/DejaVuSans-Bold-subset.ttf")),
  ]).then(([regular, bold]) => [
    { name: "DejaVu Sans", data: regular, weight: 400 as const, style: "normal" as const },
    { name: "DejaVu Sans", data: bold, weight: 700 as const, style: "normal" as const },
  ]);
  return fonts;
}

/**
 * Open Graph obrázek veřejné ankety (1200 × 630): otázka, pár odpovědí,
 * výzva. Nikdy správná odpověď ani výsledky. Pro živá hlasování (jejich
 * otázky jsou tajné) a neexistující kódy obecný obrázek Hlasuju.cz.
 * URL nese ?v=<verze ankety>, takže se dá cachovat.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ publicCode: string }> }) {
  const { publicCode } = await params;
  const preview = await getSharePreview(publicCode);
  const question = preview ? shorten(preview.question, 140) : "Jednoduché online hlasování a ankety";
  const questionSize = question.length > 90 ? 46 : question.length > 50 ? 54 : 66;
  // Odhad řádků otázky (průměrná šířka znaku ~0,62 em, rezerva na zalomení
  // slov) → kolik odpovědí se ještě vejde nad tlačítko. Delší otázka =
  // méně odpovědí, nic se nepřekrývá.
  // 330 px = výška plochy mezi hlavičkou a tlačítkem.
  const charsPerLine = Math.floor(1056 / (questionSize * 0.58));
  const lines = Math.ceil(question.length / charsPerLine);
  const free = 330 - lines * questionSize * 1.15;
  const total = preview?.options.length ?? 0;
  let maxOptions = Math.max(0, Math.min(4, Math.floor(free / OPTION_HEIGHT)));
  if (maxOptions < total) maxOptions = Math.max(0, Math.floor((free - 30) / OPTION_HEIGHT));
  const shown = preview ? preview.options.slice(0, maxOptions).map((option) => shorten(option, 48)) : [];
  const more = preview ? preview.options.length - shown.length : 0;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "linear-gradient(135deg, #FAF9F6 0%, #EDE9FA 55%, #E3F0FA 100%)",
          padding: "56px 72px",
          fontFamily: "DejaVu Sans",
          color: "#293244",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", fontSize: 30, fontWeight: 700, color: "#6558B4" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 52,
              height: 52,
              borderRadius: 14,
              background: "#6558B4",
              color: "#ffffff",
              marginRight: 16,
              fontSize: 32,
            }}
          >
            ✓
          </div>
          hlasuju.cz
          <div style={{ display: "flex", marginLeft: "auto", fontSize: 24, fontWeight: 400, color: "#5b6476" }}>
            {preview ? "Anketa" : "Hlasování pro váš web"}
          </div>
        </div>

        <div style={{ display: "flex", flexShrink: 0, marginTop: 32, fontSize: questionSize, fontWeight: 700, lineHeight: 1.15 }}>{question}</div>

        <div style={{ display: "flex", flexDirection: "column", flexShrink: 1, overflow: "hidden", marginTop: 24 }}>
          {shown.map((option) => (
            <div
              key={option}
              style={{
                display: "flex",
                alignItems: "center",
                marginBottom: 12,
                padding: "10px 24px",
                borderRadius: 18,
                border: "2px solid #DDD8F3",
                background: "#ffffff",
                fontSize: 27,
              }}
            >
              <div style={{ display: "flex", width: 22, height: 22, borderRadius: 11, border: "3px solid #8277C7", marginRight: 18 }} />
              {option}
            </div>
          ))}
          {more > 0 && <div style={{ display: "flex", fontSize: 24, color: "#5b6476" }}>+ další možnosti ({more})</div>}
        </div>

        <div style={{ display: "flex", flexShrink: 0, marginTop: "auto", alignItems: "center" }}>
          <div
            style={{
              display: "flex",
              padding: "14px 34px",
              borderRadius: 18,
              background: "#6558B4",
              color: "#ffffff",
              fontSize: 32,
              fontWeight: 700,
            }}
          >
            {preview?.closed ? "Podívejte se na výsledky →" : "Zahlasujte →"}
          </div>
        </div>
      </div>
    ),
    {
      width: WIDTH,
      height: HEIGHT,
      fonts: await loadFonts(),
      headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800" },
    }
  );
}
