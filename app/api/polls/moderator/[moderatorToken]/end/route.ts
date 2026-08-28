import { NextResponse } from "next/server";
import { endPoll } from "../../../../../../lib/polls/end-poll.ts";

export async function POST(_request: Request, { params }: { params: Promise<{ moderatorToken: string }> }) {
  const { moderatorToken } = await params;

  const result = await endPoll(moderatorToken);
  if (!result.ok) {
    return NextResponse.json({ error: "Hlasování nenalezeno." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
