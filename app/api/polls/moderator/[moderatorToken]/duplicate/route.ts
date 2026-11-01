import { NextRequest, NextResponse } from "next/server";
import { duplicatePoll } from "../../../../../../lib/polls/duplicate-poll.ts";
import { sendPollCreatedEmail } from "../../../../../../lib/email/send-poll-created-email.ts";
import { getClientIp, jsonError, runAfterResponse, tooManyRequests } from "../../../../../../lib/http.ts";
import { checkRateLimits, hashIdentifier, RATE_LIMITS, rule } from "../../../../../../lib/rate-limit.ts";

/**
 * Nový běh prezentace (kopie s novým kódem, bez výsledků) — viz
 * lib/polls/duplicate-poll.ts. Stejné limity jako vytvoření hlasování.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ moderatorToken: string }> }) {
  const { moderatorToken } = await params;

  const ipHash = hashIdentifier(getClientIp(request));
  const limited = await checkRateLimits([
    rule("create-ip", ipHash, RATE_LIMITS.createPerIpShort),
    rule("create-ip-day", ipHash, RATE_LIMITS.createPerIpDaily),
  ]);
  if (!limited.ok) return tooManyRequests(limited.retryAfterSeconds);

  const result = await duplicatePoll(moderatorToken);
  if (!result.ok) {
    return result.reason === "poll_not_found"
      ? jsonError("Hlasování nenalezeno.", 404)
      : jsonError("Anketu pro web nelze spustit znovu, vytvořte novou.", 409);
  }

  // Nový moderátorský odkaz na e-mail autora (jinak by po zavření okna zmizel).
  const { email, title, publicCode } = result;
  if (email) {
    runAfterResponse(async () => {
      await sendPollCreatedEmail({ to: email, title, publicCode, moderatorToken: result.moderatorToken, mode: "live" });
    });
  }

  return NextResponse.json({ publicCode, moderatorToken: result.moderatorToken }, { status: 201 });
}
