import { NextResponse } from "next/server";
import { castVote } from "../../../../../../lib/polls/cast-vote.ts";
import { LIMITS } from "../../../../../../lib/polls/limits.ts";
import { getClientIp, jsonError, readJsonBody, tooManyRequests } from "../../../../../../lib/http.ts";
import { checkRateLimits, hashIdentifier, RATE_LIMITS, rule } from "../../../../../../lib/rate-limit.ts";

const REASON_STATUS: Record<string, number> = {
  poll_not_found: 404,
  poll_closed: 409,
  question_not_active: 409,
  option_not_found: 400,
  invalid_participant: 400,
  name_required: 403,
};

const REASON_MESSAGE: Record<string, string> = {
  poll_not_found: "Hlasování nenalezeno.",
  poll_closed: "Hlasování už bylo ukončeno.",
  question_not_active: "Tahle otázka už není aktivní.",
  option_not_found: "Neplatná odpověď.",
  invalid_participant: "Neplatný požadavek.",
  name_required: "Nejdřív zadejte své jméno nebo přezdívku.",
};

export async function POST(request: Request, { params }: { params: Promise<{ publicCode: string }> }) {
  const { publicCode } = await params;

  const body = await readJsonBody(request, LIMITS.MAX_SMALL_BODY_BYTES);
  if (!body.ok) return body.response;

  const { questionId, optionId, participantId } = (body.value ?? {}) as Record<string, unknown>;
  if (typeof questionId !== "number" || typeof optionId !== "number" || typeof participantId !== "string") {
    return jsonError("Neplatný požadavek.", 400);
  }

  // IP limit je per hlasování a velkorysý (celá aula za jednou školní
  // IP), participant limit zastaví klikací smyčky jednoho prohlížeče.
  const limited = await checkRateLimits([
    rule("vote-ip-poll", `${hashIdentifier(getClientIp(request))}:${publicCode.slice(0, 12)}`, RATE_LIMITS.votePerIpAndPoll),
    rule("vote-participant", hashIdentifier(participantId), RATE_LIMITS.votePerParticipant),
  ]);
  if (!limited.ok) return tooManyRequests(limited.retryAfterSeconds);

  const result = await castVote(publicCode, questionId, optionId, participantId);

  if (!result.ok) {
    return jsonError(REASON_MESSAGE[result.reason], REASON_STATUS[result.reason] ?? 400);
  }

  return NextResponse.json({ ok: true });
}
