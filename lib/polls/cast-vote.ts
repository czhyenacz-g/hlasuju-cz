import "server-only";
import { and, eq, gt } from "drizzle-orm";
import { getDb } from "../../db/index.ts";
import { options, polls, votes } from "../../db/schema.ts";

export type CastVoteResult =
  | { ok: true }
  | { ok: false; reason: "poll_not_found" | "poll_closed" | "question_not_active" | "option_not_found" | "invalid_participant" };

const MAX_PARTICIPANT_ID_LENGTH = 64;

/**
 * Zapíše hlas. Ochrana proti dvojitému hlasování je primárně DB unique
 * constraint (questionId, participantId) — kolize se tiše bere jako
 * úspěch (idempotentní), ne jako chyba, viz zadání "maximálně
 * jednoduché UX" (žádné "už jsi hlasoval" hlášky).
 *
 * `questionId` musí být PRÁVĚ aktuálně aktivní otázka daného pollu —
 * hlasování na starou/budoucí otázku se odmítne (chrání i proti
 * hlasům poslaným po UKONČIT HLASOVÁNÍ).
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
    .select({ id: polls.id, status: polls.status, activeQuestionId: polls.activeQuestionId })
    .from(polls)
    .where(and(eq(polls.publicCode, publicCode), gt(polls.expiresAt, new Date())))
    .limit(1);

  if (!poll) return { ok: false, reason: "poll_not_found" };
  if (poll.status !== "active") return { ok: false, reason: "poll_closed" };
  if (poll.activeQuestionId !== questionId) return { ok: false, reason: "question_not_active" };

  const [option] = await db
    .select({ id: options.id })
    .from(options)
    .where(and(eq(options.id, optionId), eq(options.questionId, questionId)))
    .limit(1);

  if (!option) return { ok: false, reason: "option_not_found" };

  try {
    await db.insert(votes).values({ questionId, optionId, participantId });
  } catch (error) {
    const isUniqueViolation =
      typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "23505";
    if (!isUniqueViolation) throw error;
    // Už hlasoval(a) u týhle otázky — bereme jako úspěch (idempotentní).
  }

  return { ok: true };
}
