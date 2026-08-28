import "server-only";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.ts";

// Líné vytvoření spojení (ne top-level při importu) — `next build`
// importuje route/page moduly i pro dynamické stránky bez skutečného
// běhu requestu, takže chybějící DATABASE_URL v build prostředí (např.
// lokální build bez .env.local) nesmí shodit celý build, jen skutečné
// volání DB při requestu (viz zadání "vytvoření hlasování nesmí
// spadnout" — stejný fail-safe duch, teď pro DB, ne pro Resend).
let cached: PostgresJsDatabase<typeof schema> | null = null;

export function getDb(): PostgresJsDatabase<typeof schema> {
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
