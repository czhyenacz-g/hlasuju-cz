import "server-only";
import { and, eq, gt, isNull, lte, lt, or, sql } from "drizzle-orm";
import { getDb } from "../../db/index.ts";
import { polls } from "../../db/schema.ts";
import { isEmailConfigured, sendEmail } from "../email/send-email.ts";
import { buildResultsEmail } from "../email/send-results-email.ts";
import { getModeratorPoll } from "./get-moderator-poll.ts";
import { getPollResponses } from "./get-question-responses.ts";

/** Kolikrát a jak často smí moderátor poslat výsledky (vždy jen na svou uloženou adresu). */
export const RESULTS_EMAIL_MAX_SENDS = 3;
export const RESULTS_EMAIL_INTERVAL_MS = 10 * 60 * 1000;

export type SendResultsEmailResult =
  | { ok: true; sentAt: string; remaining: number }
  | {
      ok: false;
      reason: "poll_not_found" | "poll_not_closed" | "no_email" | "not_configured" | "limit_reached" | "too_soon" | "send_failed";
      retryAfterSeconds?: number;
    };

/** "jan.novak@example.cz" → "ja•••@example.cz" — moderátor pozná svou adresu, nikdo jiný ji z odkazu nezíská. */
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "•••";
  return `${local.slice(0, 2)}•••@${domain}`;
}

/**
 * Pošle výsledky ukončeného hlasování na e-mail uvedený při vytvoření.
 * Jen s platným moderátorským tokenem a jen na uloženou adresu — žádný
 * vstup s příjemcem neexistuje. Odeslání se nejdřív atomicky "zabere"
 * (max. RESULTS_EMAIL_MAX_SENDS, nejdřív po RESULTS_EMAIL_INTERVAL_MS),
 * takže ani souběžná kliknutí nepošlou víc e-mailů; když Resend selže,
 * zabrání se vrátí. `ok` = Resend e-mail přijal, ne že dorazil.
 */
export async function sendResultsEmail(moderatorToken: string, now: Date = new Date()): Promise<SendResultsEmailResult> {
  const db = getDb();
  const [poll] = await db
    .select({
      id: polls.id,
      status: polls.status,
      email: polls.email,
      title: polls.title,
      publicCode: polls.publicCode,
      createdAt: polls.createdAt,
      requireParticipantName: polls.requireParticipantName,
      sentAt: polls.resultsEmailSentAt,
      count: polls.resultsEmailCount,
    })
    .from(polls)
    .where(and(eq(polls.moderatorToken, moderatorToken), gt(polls.expiresAt, now)))
    .limit(1);

  if (!poll) return { ok: false, reason: "poll_not_found" };
  if (poll.status !== "closed") return { ok: false, reason: "poll_not_closed" };
  if (!poll.email) return { ok: false, reason: "no_email" };
  if (!isEmailConfigured()) return { ok: false, reason: "not_configured" };

  const earliest = new Date(now.getTime() - RESULTS_EMAIL_INTERVAL_MS);
  const [claimed] = await db
    .update(polls)
    .set({ resultsEmailCount: sql`${polls.resultsEmailCount} + 1`, resultsEmailSentAt: now })
    .where(
      and(
        eq(polls.id, poll.id),
        lt(polls.resultsEmailCount, RESULTS_EMAIL_MAX_SENDS),
        or(isNull(polls.resultsEmailSentAt), lte(polls.resultsEmailSentAt, earliest))
      )
    )
    .returning({ count: polls.resultsEmailCount });

  if (!claimed) {
    const [current] = await db
      .select({ sentAt: polls.resultsEmailSentAt, count: polls.resultsEmailCount })
      .from(polls)
      .where(eq(polls.id, poll.id));
    if (current.count >= RESULTS_EMAIL_MAX_SENDS) return { ok: false, reason: "limit_reached" };
    const waitMs = (current.sentAt?.getTime() ?? 0) + RESULTS_EMAIL_INTERVAL_MS - now.getTime();
    return { ok: false, reason: "too_soon", retryAfterSeconds: Math.max(1, Math.ceil(waitMs / 1000)) };
  }

  const view = await getModeratorPoll(moderatorToken);
  const sent =
    view &&
    (await sendEmail({
      to: poll.email,
      ...buildResultsEmail({
        title: poll.title,
        publicCode: poll.publicCode,
        createdAt: poll.createdAt,
        uniqueParticipants: view.uniqueParticipants,
        questions: view.questions.filter((question) => question.status !== "prepared"),
        // Jména jen u jmenovitého hlasování a jen na adresu moderátora.
        responses: poll.requireParticipantName ? await getPollResponses(poll.id) : undefined,
      }),
    }));

  if (!sent || !sent.ok) {
    // Vrátit zabrání — neúspěšný pokus se nepočítá do limitu.
    await db
      .update(polls)
      .set({ resultsEmailCount: sql`greatest(${polls.resultsEmailCount} - 1, 0)`, resultsEmailSentAt: poll.sentAt })
      .where(eq(polls.id, poll.id));
    return { ok: false, reason: sent && sent.reason === "not_configured" ? "not_configured" : "send_failed" };
  }

  return { ok: true, sentAt: now.toISOString(), remaining: RESULTS_EMAIL_MAX_SENDS - claimed.count };
}
