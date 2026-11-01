import "server-only";
import { and, eq, gt } from "drizzle-orm";
import { getDb } from "../../db/index.ts";
import { polls, questions } from "../../db/schema.ts";
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
      .select({ id: questions.id, kind: questions.kind, status: questions.status })
      .from(questions)
      .where(and(eq(questions.id, toSlideId), eq(questions.pollId, poll.id)))
      .limit(1);
    if (!target) return { ok: false, reason: "slide_not_found" };

    if (poll.activeQuestionId === toSlideId) return { ok: true, activeSlideId: toSlideId, changed: false };
    if (poll.activeQuestionId !== fromSlideId) return { ok: false, reason: "stale", activeSlideId: poll.activeQuestionId };

    // Nejvýš jedna otevřená otázka — při odchodu se uzavře (i kdyby byla
    // otevřená jinde, např. ručním spuštěním v řídicí konzoli).
    await tx
      .update(questions)
      .set({ status: "ended" })
      .where(and(eq(questions.pollId, poll.id), eq(questions.status, "active")));

    if (target.kind === "question" && target.status === "prepared") {
      await tx.update(questions).set({ status: "active" }).where(eq(questions.id, target.id));
    }

    await tx.update(polls).set({ activeQuestionId: target.id, expiresAt: extendedExpiresAt() }).where(eq(polls.id, poll.id));
    return { ok: true, activeSlideId: target.id, changed: true };
  });
}
