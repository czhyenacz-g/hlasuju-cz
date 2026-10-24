import { NextResponse } from "next/server";
import { getFinalResults } from "../../../../../../lib/polls/get-final-results.ts";
import { jsonError } from "../../../../../../lib/http.ts";

const MAX_PARTICIPANT_ID_LENGTH = 200;

export async function GET(request: Request, { params }: { params: Promise<{ publicCode: string }> }) {
  const { publicCode } = await params;

  const raw = new URL(request.url).searchParams.get("participantId");
  const participantId = raw && raw.length > 0 && raw.length <= MAX_PARTICIPANT_ID_LENGTH ? raw : null;

  const result = await getFinalResults(publicCode, participantId);
  if (!result.ok) {
    // 409 = hlasování existuje, ale výsledky ještě nejsou veřejné. Žádná
    // data o otázkách se v odpovědi nevrací.
    if (result.reason === "poll_not_found") return jsonError("Hlasování nenalezeno.", 404);
    if (result.reason === "not_voted") return jsonError("Výsledky uvidíte po odeslání hlasu.", 403);
    return jsonError("Výsledky budou dostupné po ukončení hlasování.", 409);
  }

  // Odpověď závisí na participantId — nikdy ji nesdílet přes CDN.
  return NextResponse.json(result.results, { headers: { "Cache-Control": "private, no-store" } });
}
