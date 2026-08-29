import { NextResponse } from "next/server";
import { getFinalResults } from "../../../../../../lib/polls/get-final-results.ts";

const MAX_PARTICIPANT_ID_LENGTH = 200;

export async function GET(request: Request, { params }: { params: Promise<{ publicCode: string }> }) {
  const { publicCode } = await params;

  const raw = new URL(request.url).searchParams.get("participantId");
  const participantId = raw && raw.length > 0 && raw.length <= MAX_PARTICIPANT_ID_LENGTH ? raw : null;

  const results = await getFinalResults(publicCode, participantId);
  if (!results) {
    return NextResponse.json({ error: "Hlasování nenalezeno." }, { status: 404 });
  }

  return NextResponse.json(results);
}
