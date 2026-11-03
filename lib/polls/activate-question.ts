import "server-only";
import { and, eq, gt, sql } from "drizzle-orm";
import { getDb } from "../../db/index.ts";
import { polls, questions } from "../../db/schema.ts";
import { extendedExpiresAt } from "./expiry.ts";

export type ActivateQuestionResult =
  | { ok: true }
  | { ok: false; reason: "poll_not_found" | "poll_closed" | "question_not_found" | "not_live" };

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
      .select({ id: polls.id, mode: polls.mode, status: polls.status })
      .from(polls)
      .where(and(eq(polls.moderatorToken, moderatorToken), gt(polls.expiresAt, new Date())))
      .limit(1)
      .for("update");

    if (!poll) return { ok: false, reason: "poll_not_found" };
    if (poll.status !== "active") return { ok: false, reason: "poll_closed" };
    // Veřejná anketa má jedinou otázku aktivní po celou dobu — jen „Ukončit“.
    if (poll.mode !== "live") return { ok: false, reason: "not_live" };

    const [question] = await tx
      .select({ id: questions.id })
      .from(questions)
      // Slajdy, které nejsou otázkou (obsah, výsledky, žebříček), se nespouštějí —
      // promítají se navigací (navigate-slide.ts) a zůstávají „prepared“.
      .where(and(eq(questions.id, questionId), eq(questions.pollId, poll.id), eq(questions.kind, "question")))
      .limit(1);

    if (!question) return { ok: false, reason: "question_not_found" };

    await tx
      .update(questions)
      .set({ status: "ended" })
      .where(and(eq(questions.pollId, poll.id), eq(questions.status, "active")));

    // Spuštění i znovuotevření = nový odpočet od teď (hodiny databáze).
    await tx.update(questions).set({ status: "active", answerDeadline: sql`case when ${questions.timeLimitSeconds} is null then null else now() + make_interval(secs => ${questions.timeLimitSeconds}) end` }).where(eq(questions.id, questionId));

    await tx.update(polls).set({ activeQuestionId: questionId, expiresAt: extendedExpiresAt() }).where(eq(polls.id, poll.id));

    return { ok: true };
  });
}
