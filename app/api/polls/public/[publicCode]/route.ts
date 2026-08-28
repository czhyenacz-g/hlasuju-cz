import { NextResponse } from "next/server";
import { getPublicPoll } from "../../../../../lib/polls/get-public-poll.ts";

export async function GET(_request: Request, { params }: { params: Promise<{ publicCode: string }> }) {
  const { publicCode } = await params;
  const poll = await getPublicPoll(publicCode);

  if (!poll) {
    return NextResponse.json({ error: "Hlasování nenalezeno." }, { status: 404 });
  }

  return NextResponse.json(poll);
}
