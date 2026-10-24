import { NextResponse } from "next/server";
import { registerParticipant } from "../../../../../../lib/polls/register-participant.ts";
import { LIMITS } from "../../../../../../lib/polls/limits.ts";
import { getClientIp, jsonError, readJsonBody, tooManyRequests } from "../../../../../../lib/http.ts";
import { checkRateLimits, hashIdentifier, RATE_LIMITS, rule } from "../../../../../../lib/rate-limit.ts";

const REASON: Record<string, [string, number]> = {
  poll_not_found: ["Hlasování nenalezeno.", 404],
  poll_closed: ["Hlasování už bylo ukončeno.", 409],
  not_named: ["Toto hlasování je anonymní.", 409],
  invalid_participant: ["Neplatný požadavek.", 400],
  invalid_name: [`Zadejte jméno nebo přezdívku (1–${LIMITS.MAX_PARTICIPANT_NAME_LENGTH} znaků).`, 400],
};

/**
 * Jmenovité hlasování: uloží jméno/přezdívku účastníka. Odpověď obsahuje
 * jen jeho vlastní jméno — nikdy seznam ostatních účastníků.
 */
export async function POST(request: Request, { params }: { params: Promise<{ publicCode: string }> }) {
  const { publicCode } = await params;

  const body = await readJsonBody(request, LIMITS.MAX_SMALL_BODY_BYTES);
  if (!body.ok) return body.response;
  const { participantId, name } = (body.value ?? {}) as Record<string, unknown>;

  const limited = await checkRateLimits([
    rule("participant-ip-poll", `${hashIdentifier(getClientIp(request))}:${publicCode.slice(0, 12)}`, RATE_LIMITS.registerPerIpAndPoll),
    rule("participant-id", hashIdentifier(String(participantId)), RATE_LIMITS.registerPerParticipant),
  ]);
  if (!limited.ok) return tooManyRequests(limited.retryAfterSeconds);

  const result = await registerParticipant(publicCode, participantId, name);
  if (!result.ok) {
    const [message, status] = REASON[result.reason];
    return jsonError(message, status);
  }
  return NextResponse.json({ name: result.name });
}
