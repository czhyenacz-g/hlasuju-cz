import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { eq, isNull } from "drizzle-orm";
import { setupTestDb } from "./helpers/db.ts";
import { startMockContentApi, type MockContentApi } from "./helpers/content-api-mock.ts";
import { contentToPayload, createPoll, getContent, putContent } from "./helpers/polls.ts";
import { pollImages, polls, questions, rateLimits } from "../db/schema.ts";
import { runCleanup } from "../lib/maintenance/cleanup.ts";
import { getImageStorage } from "../lib/images/storage.ts";
import * as cronRoute from "../app/api/cron/cleanup/route.ts";

let testDb: Awaited<ReturnType<typeof setupTestDb>>;
let api: MockContentApi;
before(async () => {
  testDb = await setupTestDb();
  api = await startMockContentApi();
});
after(async () => {
  await api.close();
  await testDb.close();
});

/** Nahraje soubor do (mock) Content API a zapíše ho do evidence se zadaným stářím. */
async function addImage(pollId: number, ageHours: number) {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 10, 0, 0, 0, 10, 8, 6, 0, 0, 0, 0, 0, 0, 0]);
  const stored = await getImageStorage()!.upload(png, "image/png", { pollId });
  await testDb.db.insert(pollImages).values({
    pollId,
    storageId: stored.id,
    url: stored.url,
    width: 10,
    height: 10,
    createdAt: new Date(Date.now() - ageHours * 3600_000),
  });
  return stored;
}

async function pollIdOf(token: string) {
  const { body: content } = await getContent(token);
  const [row] = await testDb.db.select({ pollId: questions.pollId }).from(questions).where(eq(questions.id, content.questions[0].id));
  return { pollId: row.pollId, content };
}

function isLive(storageId: string) {
  return api.media.get(storageId)?.deleted === false;
}

describe("úklid obrázků (podle evidence poll_images) a rate limitů", () => {
  test("smaže osiřelé a expirované, ponechá používané a čerstvé", async () => {
    const { body: created } = await createPoll();
    const { pollId, content } = await pollIdOf(created.moderatorToken);

    const used = await addImage(pollId, 48);
    const orphanOld = await addImage(pollId, 48);
    const orphanFresh = await addImage(pollId, 1);
    const payload = contentToPayload(content);
    payload.questions[0].image = { url: used.url, width: 10, height: 10, alt: null };
    assert.equal((await putContent(created.moderatorToken, payload)).response.status, 200);

    const { body: expiredPoll } = await createPoll();
    const { pollId: expiredPollId, content: expiredContent } = await pollIdOf(expiredPoll.moderatorToken);
    const expiredImage = await addImage(expiredPollId, 24 * 40);
    const expiredPayload = contentToPayload(expiredContent);
    expiredPayload.questions[0].image = { url: expiredImage.url, width: 10, height: 10, alt: null };
    assert.equal((await putContent(expiredPoll.moderatorToken, expiredPayload)).response.status, 200);
    await testDb.db.update(polls).set({ expiresAt: new Date(Date.now() - 8 * 24 * 3600_000) }).where(eq(polls.id, expiredPollId));

    await testDb.db.insert(rateLimits).values({ key: "old", windowStart: new Date(Date.now() - 5 * 24 * 3600_000), count: 1 });

    const summary = await runCleanup();
    assert.equal(isLive(used.id), true);
    assert.equal(isLive(orphanFresh.id), true);
    assert.equal(isLive(orphanOld.id), false);
    assert.equal(isLive(expiredImage.id), false);
    assert.ok(summary.rateLimitRowsDeleted >= 1);
    assert.deepEqual(summary.images, { deleted: 2, remaining: false, stoppedBy: null });

    // Data hlasování zůstávají, evidence má jen deleted_at.
    const [expiredRow] = await testDb.db.select().from(pollImages).where(eq(pollImages.storageId, expiredImage.id));
    assert.ok(expiredRow.deletedAt);
  });

  test("rate limit Content API: úklid se zastaví a zbytek dokončí příští běh", async () => {
    const { body: created } = await createPoll();
    const { pollId } = await pollIdOf(created.moderatorToken);
    const orphans = [await addImage(pollId, 30), await addImage(pollId, 30), await addImage(pollId, 30)];

    api.limitDeletes(1);
    const first = await runCleanup();
    assert.deepEqual(first.images, { deleted: 1, remaining: true, stoppedBy: "busy" });

    api.limitDeletes(Infinity);
    const second = await runCleanup();
    assert.equal(typeof second.images === "object" && second.images.deleted, 2);
    assert.equal(orphans.every((orphan) => !isLive(orphan.id)), true);
    const pending = await testDb.db.select().from(pollImages).where(isNull(pollImages.deletedAt));
    assert.equal(pending.some((row) => orphans.some((orphan) => orphan.id === row.storageId)), false);
  });

  test("cron endpoint bez CRON_SECRET / se špatným tokenem nic nespustí", async () => {
    delete process.env.CRON_SECRET;
    assert.equal((await cronRoute.GET(new Request("http://localhost/api/cron/cleanup"))).status, 503);
    process.env.CRON_SECRET = "test-secret";
    try {
      assert.equal((await cronRoute.GET(new Request("http://localhost/api/cron/cleanup", { headers: { authorization: "Bearer nope" } }))).status, 401);
      assert.equal(
        (await cronRoute.GET(new Request("http://localhost/api/cron/cleanup", { headers: { authorization: "Bearer test-secret" } }))).status,
        200
      );
    } finally {
      delete process.env.CRON_SECRET;
    }
  });
});
