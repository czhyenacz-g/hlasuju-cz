import "server-only";
import { and, asc, eq, gt } from "drizzle-orm";
import { getDb } from "../../db/index.ts";
import { options, polls, questions } from "../../db/schema.ts";
import type { PollMode, PollStatus } from "./types.ts";

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

/** Režim nevypršelého hlasování podle veřejného kódu (null = neexistuje). */
export async function getPollMode(publicCode: string): Promise<PollMode | null> {
  if (!isPublicCodeFormat(publicCode)) return null;
  const [poll] = await getDb()
    .select({ mode: polls.mode })
    .from(polls)
    .where(and(eq(polls.publicCode, publicCode), gt(polls.expiresAt, new Date())))
    .limit(1);
  return poll ? (poll.mode as PollMode) : null;
}

export type SharePreview = {
  publicCode: string;
  title: string | null;
  question: string;
  options: string[];
  version: number;
  closed: boolean;
};

/**
 * Data pro Open Graph náhled veřejné ankety — jen text otázky a
 * odpovědí (žádná správná odpověď, výsledky ani e-mail). Živá hlasování
 * vrací null: jejich otázky jsou před spuštěním tajné.
 */
export async function getSharePreview(publicCode: string): Promise<SharePreview | null> {
  if (!isPublicCodeFormat(publicCode)) return null;
  const db = getDb();
  const [row] = await db
    .select({
      title: polls.title,
      status: polls.status,
      version: polls.version,
      questionId: questions.id,
      question: questions.text,
    })
    .from(polls)
    .innerJoin(questions, eq(questions.pollId, polls.id))
    .where(and(eq(polls.publicCode, publicCode), eq(polls.mode, "self_service"), gt(polls.expiresAt, new Date())))
    .limit(1);
  if (!row) return null;
  const optionRows = await db
    .select({ text: options.text })
    .from(options)
    .where(eq(options.questionId, row.questionId))
    .orderBy(asc(options.position));
  return {
    publicCode,
    title: row.title,
    question: row.question,
    options: optionRows.map((option) => option.text),
    version: row.version,
    closed: row.status === "closed",
  };
}
