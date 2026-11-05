import "server-only";
import { sql } from "drizzle-orm";
import { getDb } from "../../db/index.ts";

export const DATABASE_CHECK_TIMEOUT_MS = 3000;

/**
 * Malý dotaz na databázi s krátkým timeoutem — jen „spojení funguje“.
 * Nepotvrzuje volné místo ani funkčnost všech operací aplikace.
 * Chyby se nevracejí (ani do odpovědi endpointu), jen true/false.
 */
export async function checkDatabase(timeoutMs = DATABASE_CHECK_TIMEOUT_MS): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs);
  });
  const query = getDb()
    .execute(sql`select 1`)
    .then(() => true as const)
    .catch(() => false as const);
  try {
    return await Promise.race([query, timeout]);
  } catch {
    // getDb() bez DATABASE_URL hází synchronně.
    return false;
  } finally {
    clearTimeout(timer);
  }
}
