import { NextResponse } from "next/server";
import { getPublicPoll } from "../../../../../lib/polls/get-public-poll.ts";

// Stav pro účastníky se stahuje pollingem každých ~2,5 s od každého
// účastníka. Krátká CDN cache (1 s) na Vercelu sloučí stovky stejných
// požadavků z jedné přednášky do ~1 dotazu za sekundu na DB — výrazně
// levnější a odolnější proti zahlcení, zpoždění pro účastníky max ~1 s.
// Odpověď je pro všechny účastníky stejná (nic per-uživatel).
const CACHE_HEADERS = { "Cache-Control": "public, max-age=0, s-maxage=1, stale-while-revalidate=1" };

export async function GET(_request: Request, { params }: { params: Promise<{ publicCode: string }> }) {
  const { publicCode } = await params;
  const poll = await getPublicPoll(publicCode);

  if (!poll) {
    return NextResponse.json({ error: "Hlasování nenalezeno." }, { status: 404, headers: CACHE_HEADERS });
  }

  return NextResponse.json(poll, { headers: CACHE_HEADERS });
}
