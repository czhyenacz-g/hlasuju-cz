import "server-only";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.ts";

// Líné vytvoření spojení (ne top-level při importu) — `next build`
// importuje route/page moduly i pro dynamické stránky bez skutečného
// běhu requestu, takže chybějící DATABASE_URL v build prostředí (např.
// lokální build bez .env.local) nesmí shodit celý build, jen skutečné
// volání DB při requestu (viz zadání "vytvoření hlasování nesmí
// spadnout" — stejný fail-safe duch, teď pro DB, ne pro Resend).
// Obecný Postgres typ (ne konkrétně postgres-js), aby testy mohly
// podstrčit in-memory PGlite přes setDbForTesting().
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

let cached: Db | null = null;

export function getDb(): Db {
  if (cached) return cached;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL není nastaven. Lokálně: zkopíruj .env.example do .env.local a vyplň ho. " +
        "Na Vercelu: Project Settings → Environment Variables."
    );
  }

  // `prepare: false` — nutné pro Neon pooled (-pooler) spojení, PgBouncer
  // v transaction mode nepodporuje server-side prepared statements přes
  // víc requestů (viz .agents/skills/neon-postgres/SKILL.md ve starteru).
  const client = postgres(connectionString, { prepare: false });
  cached = drizzle(client, { schema });
  return cached;
}

/** Jen pro testy (test/helpers/db.ts) — produkční kód tohle nevolá. */
export function setDbForTesting(db: Db | null): void {
  cached = db;
}
