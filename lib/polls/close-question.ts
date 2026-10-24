import "server-only";
import { and, eq, gt } from "drizzle-orm";
import { getDb } from "../../db/index.ts";
import { polls, questions } from "../../db/schema.ts";

export type CloseQuestionResult =
  | { ok: true }
  | { ok: false; reason: "poll_not_found" | "poll_closed" | "question_not_active" };

/**
 * Ukončí hlasování u aktuální otázky, ale celé hlasování nechá běžet.
 * `polls.activeQuestionId` zůstává — účastníci tak vidí fázi
 * "vyhodnocení" (otázka ukončená, odkrytý odkaz; v budoucím soutěžním
 * režimu i správná odpověď), dokud moderátor nespustí další otázku.
 * Idempotentní: opakované ukončení stejné otázky je OK.
 */
export async function closeQuestion(moderatorToken: string, questionId: number): Promise<CloseQuestionResult> {
  return getDb().transaction(async (tx): Promise<CloseQuestionResult> => {
    const [poll] = await tx
      .select({ id: polls.id, status: polls.status, activeQuestionId: polls.activeQuestionId })
      .from(polls)
      .where(and(eq(polls.moderatorToken, moderatorToken), gt(polls.expiresAt, new Date())))
      .limit(1)
      .for("update");

    if (!poll) return { ok: false, reason: "poll_not_found" };
    if (poll.status !== "active") return { ok: false, reason: "poll_closed" };
    if (poll.activeQuestionId !== questionId) return { ok: false, reason: "question_not_active" };

    await tx
      .update(questions)
      .set({ status: "ended" })
      .where(and(eq(questions.id, questionId), eq(questions.pollId, poll.id), eq(questions.status, "active")));

    return { ok: true };
  });
}
