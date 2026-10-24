import { NextResponse } from "next/server";
import { sendResultsEmail } from "../../../../../../lib/polls/send-results-email.ts";
import { jsonError, tooManyRequests } from "../../../../../../lib/http.ts";

const MESSAGES = {
  poll_not_found: ["Hlasování nenalezeno.", 404],
  poll_not_closed: ["Výsledky lze poslat až po ukončení hlasování.", 409],
  no_email: ["U hlasování není uložený e-mail.", 409],
  not_configured: ["Odesílání e-mailů není na serveru nastavené.", 503],
  limit_reached: ["Výsledky už byly odeslány maximální počet krát.", 429],
  send_failed: ["E-mail se nepodařilo odeslat. Zkuste to později.", 502],
} as const;

/**
 * Pošle výsledky na e-mail uložený při vytvoření hlasování. Příjemce
 * nejde zadat — endpoint tak nejde zneužít k posílání cizím lidem.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ moderatorToken: string }> }) {
  const { moderatorToken } = await params;
  const result = await sendResultsEmail(moderatorToken);
  if (result.ok) return NextResponse.json(result);
  if (result.reason === "too_soon") return tooManyRequests(result.retryAfterSeconds ?? 60);
  const [message, status] = MESSAGES[result.reason];
  return jsonError(message, status);
}
