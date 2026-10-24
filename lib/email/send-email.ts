import "server-only";
import { Resend } from "resend";

const DEFAULT_FROM = "Hlasuju.cz <onboarding@resend.dev>";

export type EmailAttachment = { filename: string; content: string; contentType?: string };

export type SendEmailResult =
  | { ok: true; id: string | null }
  | { ok: false; reason: "not_configured" | "failed" };

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

/**
 * Jediné místo, které volá Resend. `ok: true` znamená jen, že Resend
 * e-mail PŘIJAL k odeslání — doručení do schránky tím potvrzené není.
 *
 * Resend SDK při chybě API nevyhazuje výjimku, ale vrací `{ error }` —
 * proto se kontroluje obojí. Do logu jde jen typ chyby, nikdy adresa
 * příjemce ani obsah (moderátorský odkaz je přístupový údaj).
 */
export async function sendEmail(message: {
  to: string;
  subject: string;
  html: string;
  text: string;
  attachments?: EmailAttachment[];
}): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, reason: "not_configured" };

  try {
    const { data, error } = await new Resend(apiKey).emails.send({
      from: process.env.RESEND_FROM_EMAIL || DEFAULT_FROM,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
      attachments: message.attachments?.map((attachment) => ({
        filename: attachment.filename,
        content: Buffer.from(attachment.content, "utf8"),
        contentType: attachment.contentType,
      })),
    });
    if (error) {
      console.error("Resend odmítl e-mail:", error.name);
      return { ok: false, reason: "failed" };
    }
    return { ok: true, id: data?.id ?? null };
  } catch (error) {
    console.error("Odeslání e-mailu selhalo:", error instanceof Error ? error.name : "unknown");
    return { ok: false, reason: "failed" };
  }
}
