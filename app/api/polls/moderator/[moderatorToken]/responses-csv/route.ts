import { and, eq, gt } from "drizzle-orm";
import { getDb } from "../../../../../../db/index.ts";
import { polls } from "../../../../../../db/schema.ts";
import { buildResponsesCsv } from "../../../../../../lib/email/send-results-email.ts";
import { getPollResponses } from "../../../../../../lib/polls/get-question-responses.ts";
import { jsonError } from "../../../../../../lib/http.ts";

/**
 * CSV s individuálními odpověďmi — jen jmenovité hlasování a jen
 * s platným moderátorským tokenem (anonymní hlasování mají CSV souhrnné).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ moderatorToken: string }> }) {
  const { moderatorToken } = await params;
  const [poll] = await getDb()
    .select({ id: polls.id, publicCode: polls.publicCode, requireParticipantName: polls.requireParticipantName })
    .from(polls)
    .where(and(eq(polls.moderatorToken, moderatorToken), gt(polls.expiresAt, new Date())))
    .limit(1);
  if (!poll) return jsonError("Hlasování nenalezeno.", 404);
  if (!poll.requireParticipantName) return jsonError("Hlasování je anonymní.", 409);

  return new Response(buildResponsesCsv(await getPollResponses(poll.id)), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="odpovedi-${poll.publicCode}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
