import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "../db/schema.ts";
import { setDbForTesting } from "../db/index.ts";
import { MIGRATIONS_FOLDER } from "./helpers/db.ts";
import { getPublicPoll } from "../lib/polls/get-public-poll.ts";
import { getModeratorPoll } from "../lib/polls/get-moderator-poll.ts";
import { getEditorContent } from "../lib/polls/get-editor-content.ts";

async function runSqlFile(client: PGlite, file: string) {
  const sql = readFileSync(join(MIGRATIONS_FOLDER, file), "utf8");
  for (const statement of sql.split("--> statement-breakpoint")) {
    if (statement.trim()) await client.exec(statement);
  }
}

describe("migrace 0001 je zpětně kompatibilní", () => {
  test("hlasování založené před migrací (bez obrázků/odkazů) dál funguje", async () => {
    const client = new PGlite();
    const files = readdirSync(MIGRATIONS_FOLDER).filter((file) => file.endsWith(".sql")).sort();
    assert.equal(files[0], "0000_tidy_sunfire.sql");

    await runSqlFile(client, files[0]);
    // Data ve tvaru, jak je zapisovala původní verze aplikace.
    await client.exec(`
      INSERT INTO polls (id, title, public_code, moderator_token, status, active_question_id, expires_at)
        VALUES (1, 'Staré', '424242', 'legacy-token-legacy-token-legacy-token-abc', 'active', 10, now() + interval '10 days');
      INSERT INTO questions (id, poll_id, text, position, status) VALUES (10, 1, 'Stará otázka', 0, 'active'), (11, 1, 'Další', 1, 'prepared');
      INSERT INTO options (id, question_id, text, position) VALUES (100, 10, 'A', 0), (101, 10, 'B', 1), (102, 11, 'C', 0), (103, 11, 'D', 1);
      INSERT INTO votes (question_id, option_id, participant_id) VALUES (10, 100, 'p1');
    `);

    for (const file of files.slice(1)) await runSqlFile(client, file);

    setDbForTesting(drizzle(client, { schema }) as never);
    try {
      const view = await getPublicPoll("424242");
      assert.equal(view?.activeQuestion?.text, "Stará otázka");
      assert.equal(view?.activeQuestion?.image, null);
      assert.equal(view?.activeQuestion?.link, null);

      const moderator = await getModeratorPoll("legacy-token-legacy-token-legacy-token-abc");
      assert.equal(moderator?.questions[0].totalVotes, 1);

      const editor = await getEditorContent("legacy-token-legacy-token-legacy-token-abc");
      assert.equal(editor?.version, 1);
      assert.equal(editor?.questions[0].locked, true);
      assert.equal(editor?.questions[1].locked, false);
    } finally {
      setDbForTesting(null);
      await client.close();
    }
  });
});
