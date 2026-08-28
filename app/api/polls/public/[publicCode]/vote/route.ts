import { NextResponse } from "next/server";
import { castVote } from "../../../../../../lib/polls/cast-vote.ts";

const REASON_STATUS: Record<string, number> = {
  poll_not_found: 404,
  poll_closed: 409,
  question_not_active: 409,
  option_not_found: 400,
  invalid_participant: 400,
};

const REASON_MESSAGE: Record<string, string> = {
  poll_not_found: "Hlasování nenalezeno.",
  poll_closed: "Hlasování už bylo ukončeno.",
  question_not_active: "Tahle otázka už není aktivní.",
  option_not_found: "Neplatná odpověď.",
  invalid_participant: "Neplatný požadavek.",
};

export async function POST(request: Request, { params }: { params: Promise<{ publicCode: string }> }) {
  const { publicCode } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Neplatný JSON." }, { status: 400 });
  }

  const { questionId, optionId, participantId } = (body ?? {}) as Record<string, unknown>;
  if (typeof questionId !== "number" || typeof optionId !== "number" || typeof participantId !== "string") {
    return NextResponse.json({ error: "Neplatný požadavek." }, { status: 400 });
  }

  const result = await castVote(publicCode, questionId, optionId, participantId);

  if (!result.ok) {
    return NextResponse.json(
      { error: REASON_MESSAGE[result.reason] },
      { status: REASON_STATUS[result.reason] ?? 400 }
    );
  }

  return NextResponse.json({ ok: true });
}
