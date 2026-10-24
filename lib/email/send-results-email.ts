import "server-only";
import { SITE_URL } from "../../app/config/site.ts";
import { LIMITS } from "../polls/limits.ts";
import { button, emailLayout, emailStyles, escapeHtml } from "./layout.ts";

export type ResultsEmailQuestion = {
  text: string;
  options: { id?: number; text: string; votes: number }[];
  totalVotes: number;
  /** Nepovinná správná odpověď — u ní ✓ v e-mailu a „ano“ v CSV. */
  correctOptionId?: number | null;
};

function isCorrect(question: ResultsEmailQuestion, option: ResultsEmailQuestion["options"][number]): boolean {
  return question.correctOptionId != null && option.id === question.correctOptionId;
}

export type ResultsEmailInput = {
  title: string | null;
  publicCode: string;
  createdAt: Date;
  uniqueParticipants: number;
  questions: ResultsEmailQuestion[];
  /** Jen jmenovité hlasování: individuální odpovědi → druhá CSV příloha. */
  responses?: ResponsesCsvRow[];
};

export type ResponsesCsvRow = { questionPosition: number; questionText: string; label: string; optionText: string; correct: boolean | null };

/** Celá procenta; součet nemusí dát přesně 100 (zaokrouhlení), stejně jako na webu. */
export function percent(votes: number, total: number): number {
  return total > 0 ? Math.round((votes / total) * 100) : 0;
}

export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("cs-CZ", { day: "numeric", month: "numeric", year: "numeric", timeZone: "Europe/Prague" }).format(date);
}

function csvCell(value: string | number): string {
  const text = String(value);
  // Středník kvůli českému Excelu; buňky začínající =+-@ neutralizovat (CSV injection).
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[";\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function toCsv(rows: (string | number)[][]): string {
  // BOM, aby Excel poznal UTF-8 (diakritika).
  return "\uFEFF" + rows.map((row) => row.map(csvCell).join(";")).join("\r\n") + "\r\n";
}

/** Individuální odpovědi (jen moderátor jmenovitého hlasování). Číslo otázky = pořadí mezi spuštěnými. */
export function buildResponsesCsv(responses: ResponsesCsvRow[]): string {
  const numbers = new Map([...new Set(responses.map((row) => row.questionPosition))].sort((a, b) => a - b).map((position, index) => [position, index + 1]));
  return toCsv([
    ["Otázka", "Účastník", "Odpověď", "Výsledek"],
    ...responses.map((row) => [
      `${numbers.get(row.questionPosition)}. ${row.questionText}`,
      row.label,
      row.optionText,
      row.correct === null ? "" : row.correct ? "správně" : "nesprávně",
    ]),
  ]);
}

export function buildResultsCsv(input: ResultsEmailInput): string {
  const rows: (string | number)[][] = [["Otázka", "Odpověď", "Hlasy", "Procenta", "Správná"]];
  input.questions.forEach((question, index) => {
    for (const option of question.options) {
      rows.push([
        `${index + 1}. ${question.text}`,
        option.text,
        option.votes,
        `${percent(option.votes, question.totalVotes)} %`,
        isCorrect(question, option) ? "ano" : "",
      ]);
    }
  });
  return toCsv(rows);
}

function votesWord(count: number) {
  if (count === 1) return "hlas";
  if (count >= 2 && count <= 4) return "hlasy";
  return "hlasů";
}

export function buildResultsEmail(input: ResultsEmailInput) {
  const { MUTED, BRAND, LAVENDER, LINE } = emailStyles;
  const title = input.title?.trim() || "Hlasování";
  const resultsUrl = `${SITE_URL}/${input.publicCode}`;
  const date = formatDate(input.createdAt);
  const subject = `Výsledky: ${title} – Hlasuju.cz`;

  const questionsHtml = input.questions
    .map((question, index) => {
      const rows = question.options
        .map((option) => {
          const pct = percent(option.votes, question.totalVotes);
          const mark = isCorrect(question, option) ? `<strong style="color:#1f7a4d">✓ </strong>` : "";
          const note = isCorrect(question, option) ? ` <span style="font-size:13px;color:#1f7a4d">(správná odpověď)</span>` : "";
          return `<tr><td style="padding:6px 0 2px;font-size:15px">${mark}${escapeHtml(option.text)}${note}</td><td align="right" style="padding:6px 0 2px;font-size:15px;white-space:nowrap"><strong>${pct} %</strong> <span style="color:${MUTED}">· ${option.votes} ${votesWord(option.votes)}</span></td></tr>
<tr><td colspan="2" style="padding:0 0 4px"><div style="background:${LAVENDER};border-radius:6px;height:8px"><div style="background:${BRAND};border-radius:6px;height:8px;width:${pct}%"></div></div></td></tr>`;
        })
        .join("");
      return `<div style="margin:0 0 20px;padding:16px;border:1px solid ${LINE};border-radius:14px">
<p style="margin:0 0 8px;font-size:16px;font-weight:700">${index + 1}. ${escapeHtml(question.text)}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
<p style="margin:8px 0 0;font-size:13px;color:${MUTED}">Celkem ${question.totalVotes} ${votesWord(question.totalVotes)}</p></div>`;
    })
    .join("");

  const html = emailLayout({
    preheader: `${input.questions.length} otázek · ${input.uniqueParticipants} účastníků`,
    heading: `Výsledky: ${title}`,
    body: `
<p style="margin:0 0 20px;font-size:15px;color:${MUTED}">${escapeHtml(date)} · kód ${escapeHtml(input.publicCode)} · účastníků: <strong style="color:inherit">${input.uniqueParticipants}</strong></p>
${questionsHtml || `<p style="font-size:15px">Žádná otázka nebyla spuštěna.</p>`}
<p style="margin:8px 0 6px">${button(resultsUrl, "Zobrazit výsledky na webu")}</p>
<p style="margin:0;font-size:13px;color:${MUTED}">Výsledky jsou na webu dostupné ${LIMITS.POLL_TTL_DAYS} dní od vytvoření hlasování. ${input.responses ? "V příloze jsou tabulky (CSV) pro Excel: souhrn a jmenovité odpovědi účastníků (osobní údaje – nepřeposílejte je dál)." : "V příloze je tabulka (CSV) pro Excel."}</p>`,
  });

  const text = [
    `Výsledky: ${title}`,
    `${date} · kód ${input.publicCode} · účastníků: ${input.uniqueParticipants}`,
    "",
    ...input.questions.flatMap((question, index) => [
      `${index + 1}. ${question.text}`,
      ...question.options.map(
        (option) =>
          `   ${isCorrect(question, option) ? "✓ " : ""}${option.text}: ${percent(option.votes, question.totalVotes)} % (${option.votes} ${votesWord(option.votes)})${isCorrect(question, option) ? " – správná odpověď" : ""}`
      ),
      `   Celkem ${question.totalVotes} ${votesWord(question.totalVotes)}`,
      "",
    ]),
    `Výsledky na webu: ${resultsUrl}`,
    "",
    "hlasuju.cz",
  ].join("\n");

  return {
    subject,
    html,
    text,
    attachments: [
      { filename: `vysledky-${input.publicCode}.csv`, content: buildResultsCsv(input), contentType: "text/csv; charset=utf-8" },
      ...(input.responses
        ? [{ filename: `odpovedi-${input.publicCode}.csv`, content: buildResponsesCsv(input.responses), contentType: "text/csv; charset=utf-8" }]
        : []),
    ],
  };
}
