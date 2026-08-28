import "server-only";
import { Resend } from "resend";
import { SITE_URL } from "../../app/config/site.ts";

/**
 * E-mail je jen bonus (viz zadání) — bez RESEND_API_KEY, nebo při
 * jakékoli chybě Resendu, se nic nesmí rozbít. Vytvoření hlasování
 * musí uspět bez ohledu na to, jestli se e-mail podařilo poslat.
 */
export async function sendPollCreatedEmail(params: {
  to: string;
  title: string | null;
  publicCode: string;
  moderatorToken: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;

  const publicUrl = `${SITE_URL}/${params.publicCode}`;
  const moderatorUrl = `${SITE_URL}/m/${params.moderatorToken}`;

  try {
    const resend = new Resend(apiKey);
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || "hlasuju.cz <onboarding@resend.dev>",
      to: params.to,
      subject: "Vaše hlasování na hlasuju.cz",
      text: [
        "Vaše hlasování je připraveno.",
        "",
        params.title ? `Název: ${params.title}` : null,
        "",
        "Kód pro účastníky:",
        params.publicCode,
        "",
        "Odkaz pro účastníky:",
        publicUrl,
        "",
        "Správa hlasování:",
        moderatorUrl,
        "",
        "Tento moderátorský odkaz je soukromý. Uložte si ho.",
      ]
        .filter((line) => line !== null)
        .join("\n"),
    });
  } catch (error) {
    console.error("sendPollCreatedEmail selhal:", error instanceof Error ? error.message : error);
  }
}
