import { NextResponse } from "next/server";
import { closeQuestion } from "../../../../../../lib/polls/close-question.ts";
import { LIMITS } from "../../../../../../lib/polls/limits.ts";
import { jsonError, readJsonBody } from "../../../../../../lib/http.ts";

const REASON_STATUS = { poll_not_found: 404, poll_closed: 409, question_not_active: 409 } as const;

/** Ukončí hlasování u aktuální otázky (celé hlasování běží dál). */
export async function POST(request: Request, { params }: { params: Promise<{ moderatorToken: string }> }) {
  const { moderatorToken } = await params;

  const body = await readJsonBody(request, LIMITS.MAX_SMALL_BODY_BYTES);
  if (!body.ok) return body.response;

  const { questionId } = (body.value ?? {}) as Record<string, unknown>;
  if (typeof questionId !== "number") {
    return jsonError("Neplatný požadavek.", 400);
  }

  const result = await closeQuestion(moderatorToken, questionId);
  if (!result.ok) {
    return jsonError("Otázku se nepodařilo ukončit.", REASON_STATUS[result.reason]);
  }

  return NextResponse.json({ ok: true });
}
