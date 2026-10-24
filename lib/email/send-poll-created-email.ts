import "server-only";
import { SITE_URL } from "../../app/config/site.ts";
import { button, emailLayout, emailStyles, escapeHtml } from "./layout.ts";
import { sendEmail, type SendEmailResult } from "./send-email.ts";

export const POLL_CREATED_SUBJECT = "Vaše hlasování je připravené – Hlasuju.cz";

function formatCode(code: string) {
  return `${code.slice(0, 3)} ${code.slice(3)}`;
}

export function buildPollCreatedEmail(params: { title: string | null; publicCode: string; moderatorToken: string }) {
  const publicUrl = `${SITE_URL}/${params.publicCode}`;
  const moderatorUrl = `${SITE_URL}/m/${params.moderatorToken}`;
  const { MUTED, LAVENDER, BRAND } = emailStyles;
  const title = params.title?.trim() || null;

  const html = emailLayout({
    preheader: `Kód pro účastníky: ${formatCode(params.publicCode)}`,
    heading: title ? `Hlasování „${title}“ je připravené` : "Vaše hlasování je připravené",
    body: `
<p style="margin:0 0 8px;font-size:15px;color:${MUTED}">Kód pro účastníky</p>
<p style="margin:0 0 20px;padding:14px 18px;background:${LAVENDER};border-radius:14px;font-size:30px;font-weight:700;letter-spacing:4px;color:${BRAND};text-align:center">${escapeHtml(formatCode(params.publicCode))}</p>
<p style="margin:0 0 6px;font-size:15px"><strong>Odkaz pro účastníky</strong> (můžete ho sdílet):</p>
<p style="margin:0 0 20px;font-size:15px"><a href="${escapeHtml(publicUrl)}" style="color:${BRAND}">${escapeHtml(publicUrl)}</a></p>
<p style="margin:0 0 6px;font-size:15px"><strong>Váš moderátorský odkaz</strong> – spouštíte jím otázky a vidíte výsledky:</p>
<p style="margin:0 0 16px">${button(moderatorUrl, "Otevřít správu hlasování")}</p>
<p style="margin:0 0 20px;font-size:13px;color:${MUTED};word-break:break-all">${escapeHtml(moderatorUrl)}</p>
<p style="margin:0 0 20px;padding:12px 14px;border-radius:12px;background:#fff7e6;font-size:14px">🔒 Moderátorský odkaz nikomu nepřeposílejte – kdo ho má, může hlasování ovládat a upravovat.</p>
<p style="margin:0 0 8px;font-size:15px"><strong>Jak na to</strong></p>
<ol style="margin:0;padding-left:20px;font-size:15px;line-height:1.6">
<li>Otevřete moderátorský odkaz a ukažte účastníkům kód nebo QR kód.</li>
<li>Účastníci zadají kód na hlasuju.cz – stačí mobil, bez registrace.</li>
<li>Spouštějte otázky jednu po druhé a výsledky ukažte hned.</li>
</ol>`,
  });

  const text = [
    title ? `Hlasování „${title}“ je připravené.` : "Vaše hlasování je připravené.",
    "",
    `Kód pro účastníky: ${formatCode(params.publicCode)}`,
    `Odkaz pro účastníky: ${publicUrl}`,
    "",
    "Váš moderátorský odkaz (spouštíte jím otázky a vidíte výsledky):",
    moderatorUrl,
    "Moderátorský odkaz nikomu nepřeposílejte – kdo ho má, může hlasování ovládat a upravovat.",
    "",
    "Jak na to:",
    "1. Otevřete moderátorský odkaz a ukažte účastníkům kód nebo QR kód.",
    "2. Účastníci zadají kód na hlasuju.cz – stačí mobil, bez registrace.",
    "3. Spouštějte otázky jednu po druhé a výsledky ukažte hned.",
    "",
    "hlasuju.cz",
  ].join("\n");

  return { subject: POLL_CREATED_SUBJECT, html, text };
}

/**
 * Fail-open: bez RESEND_API_KEY nebo při chybě Resendu se nic nerozbije —
 * vytvoření hlasování uspěje vždy (volá se přes after() až po odpovědi).
 */
export async function sendPollCreatedEmail(params: {
  to: string;
  title: string | null;
  publicCode: string;
  moderatorToken: string;
}): Promise<SendEmailResult> {
  return sendEmail({ to: params.to, ...buildPollCreatedEmail(params) });
}
