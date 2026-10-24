import "server-only";
import { and, eq, gt } from "drizzle-orm";
import { getDb } from "../../db/index.ts";
import { participants, polls } from "../../db/schema.ts";
import { normalizeParticipantName } from "./validate.ts";

export type RegisterParticipantResult =
  | { ok: true; name: string }
  | { ok: false; reason: "poll_not_found" | "poll_closed" | "not_named" | "invalid_participant" | "invalid_name" };

const MAX_PARTICIPANT_ID_LENGTH = 64;

/**
 * Uloží jméno/přezdívku účastníka jmenovitého hlasování. Idempotentní a
 * bezpečné proti souběžným požadavkům (unique index + ON CONFLICT DO
 * NOTHING): platí PRVNÍ uložené jméno, další požadavky vrátí to uložené —
 * jméno u už odevzdaných hlasů tak nejde dodatečně přepsat. Hlas se tím
 * nevytváří. Funguje jen pro hlasování v jmenovitém režimu, které běží.
 */
export async function registerParticipant(
  publicCode: string,
  participantId: unknown,
  rawName: unknown
): Promise<RegisterParticipantResult> {
  if (typeof participantId !== "string" || participantId.length === 0 || participantId.length > MAX_PARTICIPANT_ID_LENGTH) {
    return { ok: false, reason: "invalid_participant" };
  }
  const name = normalizeParticipantName(rawName);
  if (!name) return { ok: false, reason: "invalid_name" };

  const db = getDb();
  const [poll] = await db
    .select({ id: polls.id, status: polls.status, requireParticipantName: polls.requireParticipantName })
    .from(polls)
    .where(and(eq(polls.publicCode, publicCode), gt(polls.expiresAt, new Date())))
    .limit(1);

  if (!poll) return { ok: false, reason: "poll_not_found" };
  if (!poll.requireParticipantName) return { ok: false, reason: "not_named" };
  if (poll.status !== "active") return { ok: false, reason: "poll_closed" };

  await db.insert(participants).values({ pollId: poll.id, participantId, name }).onConflictDoNothing();
  const [stored] = await db
    .select({ name: participants.name })
    .from(participants)
    .where(and(eq(participants.pollId, poll.id), eq(participants.participantId, participantId)))
    .limit(1);

  return { ok: true, name: stored.name };
}
