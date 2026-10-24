import { NextResponse } from "next/server";
import { activateQuestion } from "../../../../../../lib/polls/activate-question.ts";
import { LIMITS } from "../../../../../../lib/polls/limits.ts";
import { jsonError, readJsonBody } from "../../../../../../lib/http.ts";

const REASON_STATUS = { poll_not_found: 404, poll_closed: 409, question_not_found: 400 } as const;

export async function POST(request: Request, { params }: { params: Promise<{ moderatorToken: string }> }) {
  const { moderatorToken } = await params;

  const body = await readJsonBody(request, LIMITS.MAX_SMALL_BODY_BYTES);
  if (!body.ok) return body.response;

  const { questionId } = (body.value ?? {}) as Record<string, unknown>;
  if (typeof questionId !== "number") {
    return jsonError("Neplatný požadavek.", 400);
  }

  const result = await activateQuestion(moderatorToken, questionId);
  if (!result.ok) {
    const message = result.reason === "poll_closed" ? "Hlasování už bylo ukončeno." : "Otázku se nepodařilo spustit.";
    return jsonError(message, REASON_STATUS[result.reason]);
  }

  return NextResponse.json({ ok: true });
}
