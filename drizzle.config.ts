import type { Config } from "drizzle-kit";

// Migrace vždy proti PŘÍMÉMU (ne pooled/-pooler) connection stringu —
// viz .agents/skills/neon-postgres v starteru: pooled spojení (PgBouncer
// transaction mode) neumí spolehlivě session-level operace, které
// drizzle-kit při migraci potřebuje.
const connectionString = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL (nebo DATABASE_URL_UNPOOLED) není nastaven — viz .env.example.");
}

export default {
  schema: "./db/schema.ts",
  out: "./db/migrations",
  dialect: "postgresql",
  dbCredentials: { url: connectionString },
} satisfies Config;
