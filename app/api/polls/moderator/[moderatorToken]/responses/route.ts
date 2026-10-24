import { NextResponse } from "next/server";
import { getQuestionResponses } from "../../../../../../lib/polls/get-question-responses.ts";
import { jsonError } from "../../../../../../lib/http.ts";

/**
 * Individuální odpovědi u otázky (?questionId=…&offset=…) — jen s
 * platným moderátorským tokenem. Načítá se až po kliknutí na „Zobrazit
 * odpovědi účastníků“, žádný polling.
 */
export async function GET(request: Request, { params }: { params: Promise<{ moderatorToken: string }> }) {
  const { moderatorToken } = await params;
  const url = new URL(request.url);
  const questionId = Number(url.searchParams.get("questionId"));
  const offset = Number(url.searchParams.get("offset") ?? "0");
  if (!Number.isSafeInteger(questionId) || questionId <= 0 || !Number.isSafeInteger(offset) || offset < 0 || offset > 1_000_000) {
    return jsonError("Neplatný požadavek.", 400);
  }

  const page = await getQuestionResponses(moderatorToken, questionId, offset);
  if (!page) return jsonError("Hlasování nebo otázka nenalezena.", 404);
  return NextResponse.json(page, { headers: { "Cache-Control": "private, no-store" } });
}
