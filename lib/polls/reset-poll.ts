import "server-only";
import { and, eq, gt, inArray } from "drizzle-orm";
import { getDb } from "../../db/index.ts";
import { participants, polls, questions, votes } from "../../db/schema.ts";
import { extendedExpiresAt } from "./expiry.ts";

export type ResetPollResult = { ok: true } | { ok: false; reason: "poll_not_found" | "not_live" };

/**
 * „Znovu od začátku“ — vrátí prezentaci do stavu, jako by se nikdy
 * nepřehrávala (typicky po vyzkoušení nanečisto): smaže všechny hlasy
 * a jména účastníků, všechny otázky vrátí na „prepared“, zruší aktivní
 * slajd a znovu otevře i už ukončené hlasování. Obsah, kód pro účastníky
 * a moderátorský odkaz zůstávají. Nevratné — UI se ptá na potvrzení.
 *
 * Počitadlo e-mailů s výsledky se záměrně nenuluje (ochrana proti
 * opakovanému rozesílání, viz send-results-email.ts).
 *
 * Řádek pollu je zamčený (FOR UPDATE) jako u ostatních akcí; zápis hlasu
 * drží zámek aktivní otázky (cast-vote.ts), takže po commitu už žádný
 * opožděný hlas z původního běhu neprojde.
 */
export async function resetPoll(moderatorToken: string): Promise<ResetPollResult> {
  return getDb().transaction(async (tx): Promise<ResetPollResult> => {
    const [poll] = await tx
      .select({ id: polls.id, mode: polls.mode })
      .from(polls)
      .where(and(eq(polls.moderatorToken, moderatorToken), gt(polls.expiresAt, new Date())))
      .limit(1)
      .for("update");

    if (!poll) return { ok: false, reason: "poll_not_found" };
    // Veřejná anketa nemá promítání — její hlasy jsou skutečné výsledky.
    if (poll.mode !== "live") return { ok: false, reason: "not_live" };

    await tx.update(questions).set({ status: "prepared", answerDeadline: null }).where(eq(questions.pollId, poll.id));

    const pollQuestionIds = tx.select({ id: questions.id }).from(questions).where(eq(questions.pollId, poll.id));
    await tx.delete(votes).where(inArray(votes.questionId, pollQuestionIds));
    await tx.delete(participants).where(eq(participants.pollId, poll.id));

    await tx
      .update(polls)
      .set({ status: "active", activeQuestionId: null, expiresAt: extendedExpiresAt() })
      .where(eq(polls.id, poll.id));

    return { ok: true };
  });
}
