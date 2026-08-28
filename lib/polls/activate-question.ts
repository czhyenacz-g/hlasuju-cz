import "server-only";
import { and, eq, gt } from "drizzle-orm";
import { getDb } from "../../db/index.ts";
import { polls, questions } from "../../db/schema.ts";

export type ActivateQuestionResult =
  | { ok: true }
  | { ok: false; reason: "poll_not_found" | "question_not_found" };

/**
 * Aktivuje otázku pro účastníky — nejdřív ukončí případnou dřív
 * aktivní otázku stejného pollu (vždy nejvýš jedna aktivní, viz
 * zadání), pak aktivuje cílovou a nastaví ji jako poll.activeQuestionId.
 * Idempotentní — opakované spuštění stejné otázky nic nerozbije.
 */
export async function activateQuestion(moderatorToken: string, questionId: number): Promise<ActivateQuestionResult> {
  const db = getDb();

  const [poll] = await db
    .select({ id: polls.id })
    .from(polls)
    .where(and(eq(polls.moderatorToken, moderatorToken), gt(polls.expiresAt, new Date())))
    .limit(1);

  if (!poll) return { ok: false, reason: "poll_not_found" };

  const [question] = await db
    .select({ id: questions.id })
    .from(questions)
    .where(and(eq(questions.id, questionId), eq(questions.pollId, poll.id)))
    .limit(1);

  if (!question) return { ok: false, reason: "question_not_found" };

  await db.transaction(async (tx) => {
    await tx
      .update(questions)
      .set({ status: "ended" })
      .where(and(eq(questions.pollId, poll.id), eq(questions.status, "active")));

    await tx.update(questions).set({ status: "active" }).where(eq(questions.id, questionId));

    await tx.update(polls).set({ activeQuestionId: questionId }).where(eq(polls.id, poll.id));
  });

  return { ok: true };
}
