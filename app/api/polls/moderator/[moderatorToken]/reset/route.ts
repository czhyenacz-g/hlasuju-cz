import { NextResponse } from "next/server";
import { resetPoll } from "../../../../../../lib/polls/reset-poll.ts";
import { jsonError } from "../../../../../../lib/http.ts";

/** „Znovu od začátku“ — vynuluje hlasy a stav prezentace (viz lib/polls/reset-poll.ts). */
export async function POST(_request: Request, { params }: { params: Promise<{ moderatorToken: string }> }) {
  const { moderatorToken } = await params;

  const result = await resetPoll(moderatorToken);
  if (!result.ok) {
    return result.reason === "not_live"
      ? jsonError("Anketu pro web nelze vynulovat.", 409)
      : jsonError("Hlasování nenalezeno.", 404);
  }

  return NextResponse.json({ ok: true });
}
