import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

// Migrace vždy přes přímé (ne pooled) spojení, viz drizzle.config.ts.
// Samostatný krátkodobý klient jen pro migraci, ne sdílený s db/index.ts
// (ten běží proti pooled DATABASE_URL za requestů aplikace).
async function main() {
  const connectionString = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL (nebo DATABASE_URL_UNPOOLED) není nastaven.");
  }

  const client = postgres(connectionString, { max: 1 });
  const db = drizzle(client);

  console.log("Spouštím migrace…");
  await migrate(db, { migrationsFolder: "./db/migrations" });
  console.log("Hotovo.");

  await client.end();
}

main().catch((error) => {
  console.error("Migrace selhala:", error);
  process.exit(1);
});
