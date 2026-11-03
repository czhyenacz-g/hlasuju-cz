import "server-only";
import { and, eq, gt, sql } from "drizzle-orm";
import { getDb } from "../../db/index.ts";
import { options, participants, polls, questions, votes } from "../../db/schema.ts";
import { extendedExpiresAt } from "./expiry.ts";
import { LIMITS } from "./limits.ts";

export type CastVoteResult =
  | { ok: true }
  | {
      ok: false;
      reason: "poll_not_found" | "poll_closed" | "question_not_active" | "option_not_found" | "invalid_participant" | "name_required" | "time_up";
    };

const MAX_PARTICIPANT_ID_LENGTH = 64;

/**
 * Zapíše hlas. Ochrana proti dvojitému hlasování je primárně DB unique
 * constraint (questionId, participantId) — kolize se tiše bere jako
 * úspěch (idempotentní), ne jako chyba, viz zadání "maximálně
 * jednoduché UX" (žádné "už jsi hlasoval" hlášky).
 *
 * `questionId` musí být PRÁVĚ aktuálně aktivní otázka daného pollu ve
 * stavu "active" — hlasování na starou/budoucí otázku se odmítne
 * (chrání i proti hlasům poslaným po "Ukončit otázku" a po ukončení
 * celého hlasování).
 */
export async function castVote(
  publicCode: string,
  questionId: number,
  optionId: number,
  participantId: string
): Promise<CastVoteResult> {
  if (
    typeof participantId !== "string" ||
    participantId.length === 0 ||
    participantId.length > MAX_PARTICIPANT_ID_LENGTH
  ) {
    return { ok: false, reason: "invalid_participant" };
  }

  const db = getDb();

  const [poll] = await db
    .select({
      id: polls.id,
      status: polls.status,
      activeQuestionId: polls.activeQuestionId,
      requireParticipantName: polls.requireParticipantName,
      mode: polls.mode,
      expiresAt: polls.expiresAt,
    })
    .from(polls)
    .where(and(eq(polls.publicCode, publicCode), gt(polls.expiresAt, new Date())))
    .limit(1);

  if (!poll) return { ok: false, reason: "poll_not_found" };
  if (poll.status !== "active") return { ok: false, reason: "poll_closed" };
  if (poll.activeQuestionId !== questionId) return { ok: false, reason: "question_not_active" };

  const [option] = await db
    .select({ id: options.id })
    .from(options)
    .innerJoin(questions, eq(options.questionId, questions.id))
    .where(and(eq(options.id, optionId), eq(options.questionId, questionId), eq(questions.pollId, poll.id), eq(questions.kind, "question")))
    .limit(1);

  if (!option) return { ok: false, reason: "option_not_found" };

  // Jmenovité hlasování: hlas jen od účastníka, který už zadal jméno.
  if (poll.requireParticipantName) {
    const [registered] = await db
      .select({ id: participants.id })
      .from(participants)
      .where(and(eq(participants.pollId, poll.id), eq(participants.participantId, participantId)))
      .limit(1);
    if (!registered) return { ok: false, reason: "name_required" };
  }

  // Rozhodující je stav otázky v okamžiku zápisu, ne při čtení výš: zápis
  // hlasu drží sdílený zámek řádku otázky (FOR SHARE), takže uzavření
  // otázky (navigace „Další“, „Ukončit otázku“) na něj počká, nebo naopak
  // hlas uvidí už uzavřenou otázku a odmítne se. Opožděná odpověď po
  // uzavření se tak nikdy nezapíše. U veřejné ankety (stav otázky se
  // nemění, editor tam zamyká odpovědi) stačí obyčejná kontrola.
  try {
    const accepted = await db.transaction(async (tx) => {
      const statusQuery = tx
        .select({
          id: questions.id,
          // Odpočet: rozhodují hodiny databáze, ne telefon (s malou rezervou na síť).
          timeUp: sql<boolean>`coalesce(${questions.answerDeadline} + make_interval(secs => ${LIMITS.TIME_LIMIT_GRACE_MS / 1000}) < now(), false)`,
        })
        .from(questions)
        .where(and(eq(questions.id, questionId), eq(questions.status, "active")))
        .limit(1);
      const [open] = poll.mode === "live" ? await statusQuery.for("share") : await statusQuery;
      if (!open) return "closed" as const;
      if (open.timeUp) return "time_up" as const;
      // Už hlasoval(a) u téhle otázky — bereme jako úspěch (idempotentní).
      await tx.insert(votes).values({ questionId, optionId, participantId }).onConflictDoNothing({ target: [votes.questionId, votes.participantId] });
      return "ok" as const;
    });
    if (accepted === "closed") return { ok: false, reason: "question_not_active" };
    if (accepted === "time_up") return { ok: false, reason: "time_up" };
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? (error as { code?: string }).code : undefined;
    // 23503: odpověď mezitím odstranila editace veřejné ankety (před prvním hlasem).
    if (code === "23503") return { ok: false, reason: "option_not_found" };
    throw error;
  }

  // Veřejná anketa žije, dokud se hlasuje: platnost 30 dní od posledního
  // hlasu. Zapisuje se nejvýš jednou za den, ne při každém hlasu.
  if (poll.mode === "self_service" && poll.expiresAt.getTime() < Date.now() + (LIMITS.POLL_TTL_DAYS - 1) * 24 * 60 * 60 * 1000) {
    await db.update(polls).set({ expiresAt: extendedExpiresAt() }).where(eq(polls.id, poll.id));
  }

  return { ok: true };
}
