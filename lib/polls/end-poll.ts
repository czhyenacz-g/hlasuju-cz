import "server-only";
import { and, eq, gt } from "drizzle-orm";
import { getDb } from "../../db/index.ts";
import { polls, questions } from "../../db/schema.ts";

export type EndPollResult = { ok: true } | { ok: false; reason: "poll_not_found" };

/**
 * Ukončí celé hlasování — účastníci přestanou moci hlasovat (viz
 * cast-vote.ts), výsledky i obsah jsou od teď neměnné (editor odmítá
 * uložení, viz update-poll-content.ts). Nevratné.
 */
export async function endPoll(moderatorToken: string): Promise<EndPollResult> {
  return getDb().transaction(async (tx): Promise<EndPollResult> => {
    const [poll] = await tx
      .select({ id: polls.id })
      .from(polls)
      .where(and(eq(polls.moderatorToken, moderatorToken), gt(polls.expiresAt, new Date())))
      .limit(1)
      .for("update");

    if (!poll) return { ok: false, reason: "poll_not_found" };

    await tx
      .update(questions)
      .set({ status: "ended" })
      .where(and(eq(questions.pollId, poll.id), eq(questions.status, "active")));

    await tx.update(polls).set({ status: "closed" }).where(eq(polls.id, poll.id));

    return { ok: true };
  });
}
