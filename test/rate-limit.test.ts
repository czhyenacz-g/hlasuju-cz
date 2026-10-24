import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { setupTestDb, jsonRequest, routeParams } from "./helpers/db.ts";
import { activate, createPoll, getModerator, SAMPLE_QUESTIONS, vote } from "./helpers/polls.ts";
import * as createRoute from "../app/api/polls/route.ts";
import * as voteRoute from "../app/api/polls/public/[publicCode]/vote/route.ts";
import { checkRateLimits, RATE_LIMITS } from "../lib/rate-limit.ts";
import { setDbForTesting } from "../db/index.ts";

let testDb: Awaited<ReturnType<typeof setupTestDb>>;
before(async () => {
  testDb = await setupTestDb();
});
after(async () => {
  await testDb.close();
});

describe("A2 — rate limiting a limity požadavků", () => {
  test("fixní okno: limit+1. požadavek se odmítne s Retry-After, nové okno zase pustí", async () => {
    const rules = [{ key: "test:a", limit: 3, windowSeconds: 60 }];
    const now = new Date("2026-10-24T10:00:10Z");
    for (let i = 0; i < 3; i++) assert.equal((await checkRateLimits(rules, now)).ok, true);
    const blocked = await checkRateLimits(rules, now);
    assert.equal(blocked.ok, false);
    if (!blocked.ok) assert.equal(blocked.retryAfterSeconds, 50);
    assert.equal((await checkRateLimits(rules, new Date("2026-10-24T10:01:00Z"))).ok, true);
  });

  test("vytváření hlasování z jedné IP se po limitu zastaví (429)", async () => {
    const ip = "198.51.100.77";
    const body = { questions: SAMPLE_QUESTIONS };
    for (let i = 0; i < RATE_LIMITS.createPerIpShort.limit; i++) {
      assert.equal((await createRoute.POST(jsonRequest("/api/polls", "POST", body, ip) as never)).status, 201);
    }
    const blocked = await createRoute.POST(jsonRequest("/api/polls", "POST", body, ip) as never);
    assert.equal(blocked.status, 429);
    assert.ok(blocked.headers.get("retry-after"));
    assert.equal((await createRoute.POST(jsonRequest("/api/polls", "POST", body, "198.51.100.78") as never)).status, 201);
  });

  test("200 studentů za jednou školní IP odhlasuje bez blokace", async () => {
    const { body: created } = await createPoll();
    await activate(created.moderatorToken, created.questionIds[0]);
    const { body: mod } = await getModerator(created.moderatorToken);
    const optionId = mod.questions[0].options[0].id;
    const schoolIp = "192.0.2.10";
    for (let i = 0; i < 200; i++) {
      const { response } = await vote(created.publicCode, created.questionIds[0], optionId, `student-${i}`, schoolIp);
      assert.equal(response.status, 200);
    }
    const { body: after } = await getModerator(created.moderatorToken);
    assert.equal(after.questions[0].totalVotes, 200);
  });

  test("jeden prohlížeč (participantId) nemůže hlasy spamovat", async () => {
    const { body: created } = await createPoll();
    await activate(created.moderatorToken, created.questionIds[0]);
    const { body: mod } = await getModerator(created.moderatorToken);
    // Fixní okna: 2× limit + 1, aby test prošel i když běh překročí hranici minuty.
    const statuses: number[] = [];
    for (let i = 0; i <= 2 * RATE_LIMITS.votePerParticipant.limit; i++) {
      statuses.push((await vote(created.publicCode, created.questionIds[0], mod.questions[0].options[0].id, "spammer")).response.status);
    }
    assert.ok(statuses.includes(429));
  });

  test("honeypot a příliš velké tělo", async () => {
    const honeypot = await createRoute.POST(jsonRequest("/api/polls", "POST", { website: "http://spam", questions: SAMPLE_QUESTIONS }) as never);
    assert.equal(honeypot.status, 400);

    const huge = await createRoute.POST(
      jsonRequest("/api/polls", "POST", { title: "x", questions: SAMPLE_QUESTIONS, padding: "x".repeat(300 * 1024) }) as never
    );
    assert.equal(huge.status, 413);

    const hugeVote = await voteRoute.POST(
      jsonRequest("/x", "POST", { questionId: 1, optionId: 1, participantId: "x".repeat(10_000) }),
      routeParams({ publicCode: "123456" })
    );
    assert.equal(hugeVote.status, 413);
  });

  test("výpadek DB vrstvy limitů = fail-open (hlasování se nezablokuje)", async () => {
    setDbForTesting({
      insert() {
        throw new Error("db down");
      },
    } as never);
    try {
      assert.deepEqual(await checkRateLimits([{ key: "x", limit: 1, windowSeconds: 60 }]), { ok: true });
    } finally {
      setDbForTesting(testDb.db as never);
    }
  });
});
