import "server-only";
import { and, eq, gt } from "drizzle-orm";
import { getDb } from "../../db/index.ts";
import { polls, questions } from "../../db/schema.ts";

export type EndPollResult = { ok: true } | { ok: false; reason: "poll_not_found" };

/** Ukončí celé hlasování — účastníci přestanou moci hlasovat (viz vote.ts). */
export async function endPoll(moderatorToken: string): Promise<EndPollResult> {
  const db = getDb();

  const [poll] = await db
    .select({ id: polls.id })
    .from(polls)
    .where(and(eq(polls.moderatorToken, moderatorToken), gt(polls.expiresAt, new Date())))
    .limit(1);

  if (!poll) return { ok: false, reason: "poll_not_found" };

  await db.transaction(async (tx) => {
    await tx
      .update(questions)
      .set({ status: "ended" })
      .where(and(eq(questions.pollId, poll.id), eq(questions.status, "active")));

    await tx.update(polls).set({ status: "closed" }).where(eq(polls.id, poll.id));
  });

  return { ok: true };
}
