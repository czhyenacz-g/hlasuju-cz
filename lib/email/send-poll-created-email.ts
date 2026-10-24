import "server-only";
import { SITE_URL } from "../../app/config/site.ts";
import { button, emailLayout, emailStyles, escapeHtml } from "./layout.ts";
import { sendEmail, type SendEmailResult } from "./send-email.ts";
import type { PollMode } from "../polls/types.ts";

export const POLL_CREATED_SUBJECT = "Vaše hlasování je připravené – Hlasuju.cz";

function formatCode(code: string) {
  return `${code.slice(0, 3)} ${code.slice(3)}`;
}

const LIVE_STEPS = [
  "Otevřete moderátorský odkaz a ukažte účastníkům kód nebo QR kód.",
  "Účastníci zadají kód na hlasuju.cz – stačí mobil, bez registrace.",
  "Spouštějte otázky jednu po druhé a výsledky ukažte hned.",
];
const SELF_SERVICE_STEPS = [
  "Sdílejte odkaz pro účastníky – na Facebooku, v Messengeru, WhatsAppu nebo e-mailem.",
  "Nebo na správě ankety klikněte na „Vložit na web“ a zkopírujte kód pro svůj web.",
  "Výsledky sledujte na moderátorském odkazu; anketu tam i ukončíte.",
];
export const SELF_SERVICE_CREATED_SUBJECT = "Vaše anketa je připravená – Hlasuju.cz";

export function buildPollCreatedEmail(params: { title: string | null; publicCode: string; moderatorToken: string; mode?: PollMode }) {
  const selfService = params.mode === "self_service";
  const steps = selfService ? SELF_SERVICE_STEPS : LIVE_STEPS;
  const publicUrl = `${SITE_URL}/${params.publicCode}`;
  const moderatorUrl = `${SITE_URL}/m/${params.moderatorToken}`;
  const { MUTED, LAVENDER, BRAND } = emailStyles;
  const title = params.title?.trim() || null;

  const html = emailLayout({
    preheader: `Kód pro účastníky: ${formatCode(params.publicCode)}`,
    heading: selfService
      ? title
        ? `Anketa „${title}“ přijímá hlasy`
        : "Vaše anketa přijímá hlasy"
      : title
        ? `Hlasování „${title}“ je připravené`
        : "Vaše hlasování je připravené",
    body: `
<p style="margin:0 0 8px;font-size:15px;color:${MUTED}">Kód pro účastníky</p>
<p style="margin:0 0 20px;padding:14px 18px;background:${LAVENDER};border-radius:14px;font-size:30px;font-weight:700;letter-spacing:4px;color:${BRAND};text-align:center">${escapeHtml(formatCode(params.publicCode))}</p>
<p style="margin:0 0 6px;font-size:15px"><strong>Odkaz pro účastníky</strong> (můžete ho sdílet):</p>
<p style="margin:0 0 20px;font-size:15px"><a href="${escapeHtml(publicUrl)}" style="color:${BRAND}">${escapeHtml(publicUrl)}</a></p>
<p style="margin:0 0 6px;font-size:15px"><strong>Váš moderátorský odkaz</strong> – ${selfService ? "výsledky, sdílení, kód pro web a ukončení ankety" : "spouštíte jím otázky a vidíte výsledky"}:</p>
<p style="margin:0 0 16px">${button(moderatorUrl, selfService ? "Otevřít správu ankety" : "Otevřít správu hlasování")}</p>
<p style="margin:0 0 20px;font-size:13px;color:${MUTED};word-break:break-all">${escapeHtml(moderatorUrl)}</p>
<p style="margin:0 0 20px;padding:12px 14px;border-radius:12px;background:#fff7e6;font-size:14px">🔒 Moderátorský odkaz nikomu nepřeposílejte – kdo ho má, může hlasování ovládat a upravovat.</p>
<p style="margin:0 0 8px;font-size:15px"><strong>Jak na to</strong></p>
<ol style="margin:0;padding-left:20px;font-size:15px;line-height:1.6">
${steps.map((step) => `<li>${escapeHtml(step)}</li>`).join("\n")}
</ol>`,
  });

  const text = [
    selfService
      ? title
        ? `Anketa „${title}“ přijímá hlasy.`
        : "Vaše anketa přijímá hlasy."
      : title
        ? `Hlasování „${title}“ je připravené.`
        : "Vaše hlasování je připravené.",
    "",
    `Kód pro účastníky: ${formatCode(params.publicCode)}`,
    `Odkaz pro účastníky: ${publicUrl}`,
    "",
    `Váš moderátorský odkaz (${selfService ? "výsledky, sdílení, kód pro web a ukončení ankety" : "spouštíte jím otázky a vidíte výsledky"}):`,
    moderatorUrl,
    "Moderátorský odkaz nikomu nepřeposílejte – kdo ho má, může hlasování ovládat a upravovat.",
    "",
    "Jak na to:",
    ...steps.map((step, index) => `${index + 1}. ${step}`),
    "",
    "hlasuju.cz",
  ].join("\n");

  return { subject: selfService ? SELF_SERVICE_CREATED_SUBJECT : POLL_CREATED_SUBJECT, html, text };
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
  mode?: PollMode;
}): Promise<SendEmailResult> {
  return sendEmail({ to: params.to, ...buildPollCreatedEmail(params) });
}
