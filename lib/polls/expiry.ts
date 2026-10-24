import { sql } from "drizzle-orm";
import { polls } from "../../db/schema.ts";
import { LIMITS } from "./limits.ts";

/**
 * Platnost hlasování se počítá od posledního použití, ne jen od
 * vytvoření: při spuštění otázky a při ukončení se prodlouží na nejméně
 * POLL_TTL_DAYS od teď (nikdy nezkrátí). Hlasování připravené dlouho
 * dopředu tak po akci nezmizí i s výsledky a obrázky.
 */
export function extendedExpiresAt(now: Date = new Date()) {
  const minimum = new Date(now.getTime() + LIMITS.POLL_TTL_DAYS * 24 * 60 * 60 * 1000);
  // ISO řetězec + cast: postgres-js neumí v sql`` šabloně serializovat Date.
  return sql`greatest(${polls.expiresAt}, ${minimum.toISOString()}::timestamptz)`;
}
