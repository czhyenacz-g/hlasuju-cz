import "server-only";
import { and, eq, gt } from "drizzle-orm";
import { getDb } from "../../db/index.ts";
import { polls } from "../../db/schema.ts";
import type { PollStatus } from "./types.ts";

const PUBLIC_CODE_PATTERN = /^\d{6}$/;
// generateModeratorToken() dává 43 znaků base64url; rozsah nechává
// rezervu, ale odfiltruje zjevný nesmysl bez dotazu do DB.
const MODERATOR_TOKEN_PATTERN = /^[A-Za-z0-9_-]{20,64}$/;

export function isPublicCodeFormat(code: string): boolean {
  return PUBLIC_CODE_PATTERN.test(code);
}

export function isModeratorTokenFormat(token: string): boolean {
  return MODERATOR_TOKEN_PATTERN.test(token);
}

/** Nevypršelé hlasování podle moderátorského tokenu (jen základní sloupce). */
export async function findPollByModeratorToken(
  moderatorToken: string
): Promise<{ id: number; status: PollStatus; version: number } | null> {
  if (!isModeratorTokenFormat(moderatorToken)) return null;
  const [poll] = await getDb()
    .select({ id: polls.id, status: polls.status, version: polls.version })
    .from(polls)
    .where(and(eq(polls.moderatorToken, moderatorToken), gt(polls.expiresAt, new Date())))
    .limit(1);
  return poll ? { ...poll, status: poll.status as PollStatus } : null;
}

/** Pro skutečné HTTP 404 na stránce účastníka (app/[publicCode]/page.tsx). */
export async function pollExistsByPublicCode(publicCode: string): Promise<boolean> {
  if (!isPublicCodeFormat(publicCode)) return false;
  const [poll] = await getDb()
    .select({ id: polls.id })
    .from(polls)
    .where(and(eq(polls.publicCode, publicCode), gt(polls.expiresAt, new Date())))
    .limit(1);
  return Boolean(poll);
}
