import { NextRequest, NextResponse } from "next/server";
import { createPoll } from "../../../lib/polls/create-poll.ts";
import { LIMITS } from "../../../lib/polls/limits.ts";
import { validateCreatePollInput } from "../../../lib/polls/validate.ts";
import { sendPollCreatedEmail } from "../../../lib/email/send-poll-created-email.ts";
import { getClientIp, jsonError, readJsonBody, runAfterResponse, tooManyRequests } from "../../../lib/http.ts";
import { checkRateLimits, hashIdentifier, RATE_LIMITS, rule } from "../../../lib/rate-limit.ts";

export async function POST(request: NextRequest) {
  const body = await readJsonBody(request, LIMITS.MAX_CREATE_BODY_BYTES);
  if (!body.ok) return body.response;

  // Honeypot: skryté pole "website" ve formuláři — člověk ho nevidí ani
  // nevyplní, primitivní boti vyplňují všechno.
  const raw = body.value as Record<string, unknown> | null;
  if (raw && typeof raw === "object" && typeof raw.website === "string" && raw.website.trim() !== "") {
    return jsonError("Neplatný požadavek.", 400);
  }

  const validated = validateCreatePollInput(body.value);
  if (!validated.ok) {
    return jsonError(validated.error, 400);
  }

  const ipHash = hashIdentifier(getClientIp(request));
  const limited = await checkRateLimits([
    rule("create-ip", ipHash, RATE_LIMITS.createPerIpShort),
    rule("create-ip-day", ipHash, RATE_LIMITS.createPerIpDaily),
  ]);
  if (!limited.ok) return tooManyRequests(limited.retryAfterSeconds);

  const { publicCode, moderatorToken, questionIds } = await createPoll(validated.value);

  // Až po odeslání odpovědi, ale přes `after`, aby ho serverless runtime
  // neutnul. Fail-open — e-mail je bonus (viz zadání), nikdy nesmí
  // zdržet ani shodit odpověď na vytvoření hlasování.
  const email = validated.value.email;
  if (email) {
    runAfterResponse(() =>
      sendPollCreatedEmail({
        to: email,
        title: validated.value.title ?? null,
        publicCode,
        moderatorToken,
      })
    );
  }

  return NextResponse.json({ publicCode, moderatorToken, questionIds }, { status: 201 });
}
