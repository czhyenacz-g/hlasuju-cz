import "server-only";
import { and, eq, gt, sql } from "drizzle-orm";
import { getDb } from "../../db/index.ts";
import { polls, questions, votes } from "../../db/schema.ts";
import { extendedExpiresAt } from "./expiry.ts";

export type NavigateSlideResult =
  | { ok: true; activeSlideId: number; changed: boolean }
  | { ok: false; reason: "poll_not_found" | "poll_closed" | "not_live" | "slide_not_found" }
  | { ok: false; reason: "stale"; activeSlideId: number | null };

/**
 * Přechod na slajd v promítání („Další“ / „Zpět“ / skok) — jediný zdroj
 * pravdy je řádek pollu (active_question_id) a stav otázek v DB:
 *
 * 1. Otevřená otázka se uzavře (status "ended"; zápis hlasu drží zámek
 *    otázky, takže po commitu už žádný opožděný hlas neprojde, viz
 *    cast-vote.ts).
 * 2. Cílová otázka, která ještě nebyla položena ("prepared"), se otevře.
 *    Už uzavřená otázka se při návratu znovu NEOTEVŘE (hlasy i body
 *    zůstávají) — znovuotevření je samostatná akce (activate-question.ts).
 * 3. active_question_id = cílový slajd → účastníci dostanou správný stav.
 *
 * Odolnost vůči dvojkliku a souběhu: klient posílá, ze kterého slajdu
 * odchází (`fromSlideId`). Když už je cíl aktivní, jde o opakovaný
 * požadavek → nic se nemění (idempotentní). Když je aktivní jiný slajd,
 * než klient myslí (druhé okno, starý stav), přechod se odmítne jako
 * „stale“ a klient si načte aktuální stav — dvojklik tak nikdy nepřeskočí
 * slajd. Řádek pollu je zamčený (FOR UPDATE) jako u ostatních akcí.
 */
export async function navigateSlide(moderatorToken: string, fromSlideId: number | null, toSlideId: number): Promise<NavigateSlideResult> {
  return getDb().transaction(async (tx): Promise<NavigateSlideResult> => {
    const [poll] = await tx
      .select({ id: polls.id, mode: polls.mode, status: polls.status, activeQuestionId: polls.activeQuestionId })
      .from(polls)
      .where(and(eq(polls.moderatorToken, moderatorToken), gt(polls.expiresAt, new Date())))
      .limit(1)
      .for("update");

    if (!poll) return { ok: false, reason: "poll_not_found" };
    if (poll.status !== "active") return { ok: false, reason: "poll_closed" };
    if (poll.mode !== "live") return { ok: false, reason: "not_live" };

    const [target] = await tx
      .select({ id: questions.id, kind: questions.kind, status: questions.status, position: questions.position })
      .from(questions)
      .where(and(eq(questions.id, toSlideId), eq(questions.pollId, poll.id)))
      .limit(1);
    if (!target) return { ok: false, reason: "slide_not_found" };

    if (poll.activeQuestionId === toSlideId) return { ok: true, activeSlideId: toSlideId, changed: false };
    if (poll.activeQuestionId !== fromSlideId) return { ok: false, reason: "stale", activeSlideId: poll.activeQuestionId };

    // Nejvýš jedna otevřená otázka — při odchodu se uzavře (i kdyby byla
    // otevřená jinde, např. ručním spuštěním v řídicí konzoli).
    const closed = await tx
      .update(questions)
      .set({ status: "ended" })
      .where(and(eq(questions.pollId, poll.id), eq(questions.status, "active")))
      .returning({ id: questions.id, position: questions.position });

    // „Zpět“ z otevřené otázky, na kterou ještě nikdo neodpověděl: otázka
    // se vrátí do stavu „připraveno“ (jako by nebyla položena), aby se při
    // návratu vpřed normálně otevřela a neprozradila správnou odpověď.
    // Bezpečné vůči souběhu: otázka je už uzavřená (zámek řádku), žádný
    // další hlas se do ní nezapíše (cast-vote.ts drží FOR SHARE).
    const leaving = closed.find((question) => question.id === fromSlideId);
    if (leaving && target.position < leaving.position) {
      const [voted] = await tx.select({ id: votes.id }).from(votes).where(eq(votes.questionId, leaving.id)).limit(1);
      if (!voted) await tx.update(questions).set({ status: "prepared", answerDeadline: null }).where(eq(questions.id, leaving.id));
    }

    if (target.kind === "question" && target.status === "prepared") {
      // Odpočet běží od otevření (hodiny databáze, viz cast-vote.ts).
      await tx.update(questions).set({ status: "active", answerDeadline: sql`case when ${questions.timeLimitSeconds} is null then null else now() + make_interval(secs => ${questions.timeLimitSeconds}) end` }).where(eq(questions.id, target.id));
    }

    await tx.update(polls).set({ activeQuestionId: target.id, expiresAt: extendedExpiresAt() }).where(eq(polls.id, poll.id));
    return { ok: true, activeSlideId: target.id, changed: true };
  });
}
