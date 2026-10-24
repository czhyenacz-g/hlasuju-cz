import "server-only";
import { and, asc, eq, isNull, lt, or, sql } from "drizzle-orm";
import { getDb } from "../../db/index.ts";
import { participants, pollImages, polls, questions, rateLimits } from "../../db/schema.ts";
import { deletePollImageRows } from "../images/poll-images.ts";
import { getImageStorage } from "../images/storage.ts";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

// Nahraný, ale (zatím) neuložený obrázek necháme den — moderátor může
// mít editor otevřený a ukládat až za chvíli.
const ORPHAN_GRACE_MS = DAY_MS;
// Obrázky vypršelého hlasování mažeme až týden po expiraci (rezerva,
// kdyby se někdy expirace prodlužovala).
const EXPIRED_GRACE_MS = 7 * DAY_MS;
// Nejdelší okno rate limitu je den, starší řádky už nic neovlivní.
const RATE_LIMIT_RETENTION_MS = 2 * DAY_MS;
// Mazání v Content API sdílí rate limit (10/min na token) s uploady —
// za jeden běh nesmažeme víc, zbytek počká na další den.
const MAX_IMAGE_DELETES_PER_RUN = 8;

export type CleanupSummary = {
  rateLimitRowsDeleted: number;
  participantNamesDeleted: number;
  images: "skipped_not_configured" | { deleted: number; remaining: boolean; stoppedBy: string | null };
};

/**
 * Denní úklid (app/api/cron/cleanup, vercel.json):
 * 1) staré řádky rate limitů,
 * 2) jména účastníků (osobní údaje) jmenovitých hlasování 7 dní po
 *    vypršení — hlasy zůstávají, jen bez jména,
 * 3) obrázky v Content API podle evidence poll_images — osiřelé uploady
 *    (nahrané, nikdy neuložené k otázce) a obrázky vypršelých hlasování.
 *    Data hlasování v DB se nemažou, řádek evidence dostane jen deleted_at.
 */
export async function runCleanup(now: Date = new Date()): Promise<CleanupSummary> {
  const db = getDb();

  const deletedRateLimits = await db
    .delete(rateLimits)
    .where(lt(rateLimits.windowStart, new Date(now.getTime() - RATE_LIMIT_RETENTION_MS)))
    .returning({ key: rateLimits.key });

  const deletedNames = await db
    .delete(participants)
    .where(
      sql`${participants.pollId} in (select ${polls.id} from ${polls} where ${polls.expiresAt} < ${new Date(now.getTime() - EXPIRED_GRACE_MS)})`
    )
    .returning({ id: participants.id });
  const base = { rateLimitRowsDeleted: deletedRateLimits.length, participantNamesDeleted: deletedNames.length };

  const storage = getImageStorage();
  if (!storage) return { ...base, images: "skipped_not_configured" };

  const candidates = await db
    .select({ id: pollImages.id, storageId: pollImages.storageId })
    .from(pollImages)
    .innerJoin(polls, eq(pollImages.pollId, polls.id))
    .where(
      and(
        isNull(pollImages.deletedAt),
        or(
          lt(polls.expiresAt, new Date(now.getTime() - EXPIRED_GRACE_MS)),
          and(
            lt(pollImages.createdAt, new Date(now.getTime() - ORPHAN_GRACE_MS)),
            sql`not exists (select 1 from ${questions} where ${questions.imageUrl} = ${pollImages.url})`
          )
        )
      )
    )
    .orderBy(asc(pollImages.createdAt))
    .limit(MAX_IMAGE_DELETES_PER_RUN + 1);

  const batch = candidates.slice(0, MAX_IMAGE_DELETES_PER_RUN);
  const result = await deletePollImageRows(storage, batch);
  return {
    ...base,
    images: {
      deleted: result.deleted,
      remaining: result.stoppedBy !== null || candidates.length > batch.length,
      stoppedBy: result.stoppedBy,
    },
  };
}
