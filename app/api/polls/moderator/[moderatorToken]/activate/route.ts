import { NextResponse } from "next/server";
import { activateQuestion } from "../../../../../../lib/polls/activate-question.ts";

export async function POST(request: Request, { params }: { params: Promise<{ moderatorToken: string }> }) {
  const { moderatorToken } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Neplatný JSON." }, { status: 400 });
  }

  const { questionId } = (body ?? {}) as Record<string, unknown>;
  if (typeof questionId !== "number") {
    return NextResponse.json({ error: "Neplatný požadavek." }, { status: 400 });
  }

  const result = await activateQuestion(moderatorToken, questionId);
  if (!result.ok) {
    const status = result.reason === "poll_not_found" ? 404 : 400;
    return NextResponse.json({ error: "Otázku se nepodařilo spustit." }, { status });
  }

  return NextResponse.json({ ok: true });
}
