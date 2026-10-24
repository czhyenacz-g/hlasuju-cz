import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { setupTestDb } from "./helpers/db.ts";
import { activate, createPoll, endPoll, getModerator, getPublic } from "./helpers/polls.ts";
import { polls } from "../db/schema.ts";

let testDb: Awaited<ReturnType<typeof setupTestDb>>;
before(async () => {
  testDb = await setupTestDb();
});
after(async () => {
  await testDb.close();
});

const DAY = 24 * 3600_000;

async function pollRow(code: string) {
  const [row] = await testDb.db.select().from(polls).where(eq(polls.publicCode, code));
  return row;
}

describe("platnost hlasování od posledního použití", () => {
  test("připravené dlouho dopředu: spuštění i ukončení prodlouží na 30 dní od teď", async () => {
    const { body } = await createPoll({ title: "Dopředu", questions: [{ text: "Q", options: [{ text: "A" }, { text: "B" }] }] });
    const created = await pollRow(body.publicCode);
    assert.ok(Math.abs(created.expiresAt.getTime() - created.createdAt.getTime() - 30 * DAY) < 60_000);

    // simulace: vytvořeno před 28 dny → zbývají 2 dny
    await testDb.db.update(polls).set({ expiresAt: new Date(Date.now() + 2 * DAY) }).where(eq(polls.id, created.id));
    assert.equal((await activate(body.moderatorToken, body.questionIds[0])).status, 200);
    const afterActivate = (await pollRow(body.publicCode)).expiresAt.getTime();
    assert.ok(afterActivate > Date.now() + 29.9 * DAY);

    await testDb.db.update(polls).set({ expiresAt: new Date(Date.now() + DAY) }).where(eq(polls.id, created.id));
    assert.equal((await endPoll(body.moderatorToken)).status, 200);
    assert.ok((await pollRow(body.publicCode)).expiresAt.getTime() > Date.now() + 29.9 * DAY);
    assert.equal((await getPublic(body.publicCode)).response.status, 200);
    assert.equal((await getModerator(body.moderatorToken)).response.status, 200);
  });

  test("delší platnost se nikdy nezkrátí", async () => {
    const { body } = await createPoll({ title: "Dlouhá", questions: [{ text: "Q", options: [{ text: "A" }, { text: "B" }] }] });
    const row = await pollRow(body.publicCode);
    const far = new Date(Date.now() + 90 * DAY);
    await testDb.db.update(polls).set({ expiresAt: far }).where(eq(polls.id, row.id));
    await activate(body.moderatorToken, body.questionIds[0]);
    assert.equal((await pollRow(body.publicCode)).expiresAt.getTime(), far.getTime());
  });
});
