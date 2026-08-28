import { NextResponse } from "next/server";
import { getModeratorPoll } from "../../../../../lib/polls/get-moderator-poll.ts";

export async function GET(_request: Request, { params }: { params: Promise<{ moderatorToken: string }> }) {
  const { moderatorToken } = await params;
  const poll = await getModeratorPoll(moderatorToken);

  if (!poll) {
    return NextResponse.json({ error: "Hlasování nenalezeno." }, { status: 404 });
  }

  return NextResponse.json(poll);
}
