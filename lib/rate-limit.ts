import "server-only";
import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { getDb } from "../db/index.ts";
import { rateLimits } from "../db/schema.ts";

export type RateLimitRule = { key: string; limit: number; windowSeconds: number };
export type RateLimitResult = { ok: true } | { ok: false; retryAfterSeconds: number };

/**
 * Limity jsou záměrně velkorysé — celá posluchárna často sedí za jednou
 * veřejnou IP školy, takže IP limity jen odstíní hrubé zneužití (skripty),
 * běžné hlasování stovek studentů nesmí zablokovat. Jemnější limity jsou
 * na participantId a na konkrétní hlasování (moderátorský token).
 */
export const RATE_LIMITS = {
  createPerIpShort: { limit: 10, windowSeconds: 10 * 60 },
  createPerIpDaily: { limit: 60, windowSeconds: 24 * 60 * 60 },
  // 600 hlasů/min z jedné IP do jednoho hlasování = velká aula za NATem.
  votePerIpAndPoll: { limit: 600, windowSeconds: 60 },
  votePerParticipant: { limit: 30, windowSeconds: 60 },
  // Veřejná anketa (dlouhodobě bez moderátora): jedna IP smí do jedné
  // ankety poslat nejvýš 30 hlasů za hodinu (domácnost, třída za NATem).
  selfServiceVotePerIp: { limit: 30, windowSeconds: 60 * 60 },
  uploadPerPoll: { limit: 60, windowSeconds: 60 * 60 },
  uploadPerIpDaily: { limit: 200, windowSeconds: 24 * 60 * 60 },
  contentSavePerPoll: { limit: 120, windowSeconds: 60 * 60 },
  // Zadání jména (jmenovité hlasování): celá aula za NATem + opakování.
  registerPerIpAndPoll: { limit: 300, windowSeconds: 60 },
  registerPerParticipant: { limit: 10, windowSeconds: 60 },
} as const;

/** IP ani participantId neukládáme v čitelné podobě, jen zkrácený hash. */
export function hashIdentifier(value: string): string {
  return createHash("sha256").update(value).digest("base64url").slice(0, 22);
}

export function rule(name: string, identifier: string, config: { limit: number; windowSeconds: number }): RateLimitRule {
  return { key: `${name}:${identifier}`, ...config };
}

function windowStartFor(now: Date, windowSeconds: number): Date {
  const windowMs = windowSeconds * 1000;
  return new Date(Math.floor(now.getTime() / windowMs) * windowMs);
}

/**
 * Fixed-window počítadla v Postgresu: jeden INSERT … ON CONFLICT DO UPDATE
 * pro všechna pravidla najednou (jeden round-trip). Atomické i při
 * souběžných requestech z více serverless instancí.
 *
 * Fail-open: když selže samotná DB vrstva limitů, požadavek pustíme —
 * výpadek ochrany je menší zlo než nefunkční hlasování na přednášce.
 */
export async function checkRateLimits(rules: RateLimitRule[], now: Date = new Date()): Promise<RateLimitResult> {
  if (rules.length === 0) return { ok: true };

  // Délka okna je součástí klíče, aby dvě pravidla se stejným jménem a
  // různým oknem nikdy nesdílela řádek.
  const rows = rules.map((r) => ({
    key: `${r.key}|${r.windowSeconds}`,
    windowStart: windowStartFor(now, r.windowSeconds),
    count: 1,
  }));

  try {
    const result = await getDb()
      .insert(rateLimits)
      .values(rows)
      .onConflictDoUpdate({
        target: [rateLimits.key, rateLimits.windowStart],
        set: { count: sql`${rateLimits.count} + 1` },
      })
      .returning({ key: rateLimits.key, count: rateLimits.count });

    let retryAfterSeconds = 0;
    rules.forEach((r, index) => {
      const row = result.find((item) => item.key === rows[index].key);
      if (row && row.count > r.limit) {
        const windowEnd = rows[index].windowStart.getTime() + r.windowSeconds * 1000;
        retryAfterSeconds = Math.max(retryAfterSeconds, Math.ceil((windowEnd - now.getTime()) / 1000), 1);
      }
    });

    return retryAfterSeconds > 0 ? { ok: false, retryAfterSeconds } : { ok: true };
  } catch (error) {
    console.error("checkRateLimits selhal (fail-open):", error instanceof Error ? error.message : error);
    return { ok: true };
  }
}
