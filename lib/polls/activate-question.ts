import "server-only";
import { and, eq, gt } from "drizzle-orm";
import { getDb } from "../../db/index.ts";
import { polls, questions } from "../../db/schema.ts";

export type ActivateQuestionResult =
  | { ok: true }
  | { ok: false; reason: "poll_not_found" | "poll_closed" | "question_not_found" };

/**
 * Aktivuje otázku pro účastníky — nejdřív ukončí případnou dřív
 * aktivní otázku stejného pollu (vždy nejvýš jedna aktivní, viz
 * zadání), pak aktivuje cílovou a nastaví ji jako poll.activeQuestionId.
 * Idempotentní — opakované spuštění stejné otázky nic nerozbije.
 *
 * Znovuotevření UŽ UKONČENÉ otázky je záměrně povolené (moderátor ji
 * ukončil omylem / chce dát víc času): dosavadní hlasy zůstávají, kdo
 * už hlasoval, znovu hlasovat nemůže (unique index), ostatní ano. UI se
 * před znovuotevřením ptá na potvrzení.
 *
 * Řádek pollu je zamčený (FOR UPDATE) — stejně jako při ukládání obsahu
 * v editoru, takže spuštění a editace se nikdy neprolnou. Uzavřené
 * hlasování už nejde "oživit" spuštěním otázky.
 */
export async function activateQuestion(moderatorToken: string, questionId: number): Promise<ActivateQuestionResult> {
  return getDb().transaction(async (tx): Promise<ActivateQuestionResult> => {
    const [poll] = await tx
      .select({ id: polls.id, status: polls.status })
      .from(polls)
      .where(and(eq(polls.moderatorToken, moderatorToken), gt(polls.expiresAt, new Date())))
      .limit(1)
      .for("update");

    if (!poll) return { ok: false, reason: "poll_not_found" };
    if (poll.status !== "active") return { ok: false, reason: "poll_closed" };

    const [question] = await tx
      .select({ id: questions.id })
      .from(questions)
      .where(and(eq(questions.id, questionId), eq(questions.pollId, poll.id)))
      .limit(1);

    if (!question) return { ok: false, reason: "question_not_found" };

    await tx
      .update(questions)
      .set({ status: "ended" })
      .where(and(eq(questions.pollId, poll.id), eq(questions.status, "active")));

    await tx.update(questions).set({ status: "active" }).where(eq(questions.id, questionId));

    await tx.update(polls).set({ activeQuestionId: questionId }).where(eq(polls.id, poll.id));

    return { ok: true };
  });
}
