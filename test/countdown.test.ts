import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { jsonRequest, routeParams, setupTestDb } from "./helpers/db.ts";
import * as navigateRoute from "../app/api/polls/moderator/[moderatorToken]/navigate/route.ts";
import * as resetRoute from "../app/api/polls/moderator/[moderatorToken]/reset/route.ts";
import { activate, closeQuestion, createPoll, getContent, getModerator, getPublic, putContent, vote } from "./helpers/polls.ts";
import { validateCreatePollInput } from "../lib/polls/validate.ts";
import { questions } from "../db/schema.ts";

let testDb: Awaited<ReturnType<typeof setupTestDb>>;
before(async () => {
  testDb = await setupTestDb();
});
after(async () => {
  await testDb.close();
});

const TIMED = [
  { text: "Rychle: 2 + 2?", options: [{ text: "3" }, { text: "4" }], correctOptionIndex: 1, timeLimitSeconds: 10 },
  { text: "Bez limitu", options: [{ text: "A" }, { text: "B" }] },
];

async function createTimed() {
  const { response, body } = await createPoll({ title: "Odpočet", questions: TIMED });
  assert.equal(response.status, 201);
  const moderator = (await getModerator(body.moderatorToken)).body;
  return { token: body.moderatorToken as string, code: body.publicCode as string, slides: moderator.questions as { id: number; options: { id: number }[] }[] };
}

/** Posune konec odpočtu do minulosti (místo čekání). */
async function expire(questionId: number, msAgo = 5000) {
  await testDb.db.update(questions).set({ answerDeadline: new Date(Date.now() - msAgo) }).where(eq(questions.id, questionId));
}

describe("odpočet na odpověď", () => {
  test("validace: 3–600 celých sekund, null = bez limitu", () => {
    const make = (timeLimitSeconds: unknown) =>
      validateCreatePollInput({ questions: [{ text: "Q", options: [{ text: "A" }, { text: "B" }], timeLimitSeconds }] });
    for (const ok of [3, 10, 600, null, undefined]) assert.equal(make(ok).ok, true, String(ok));
    for (const bad of [0, 2, 601, 1.5, "10", -5]) assert.equal(make(bad).ok, false, String(bad));
    const valid = make(10);
    assert.ok(valid.ok && valid.value.questions[0].timeLimitSeconds === 10);
  });

  test("uloží se, editor ho vrátí; bez spuštění neběží", async () => {
    const { token, code, slides } = await createTimed();
    const content = (await getContent(token)).body;
    assert.deepEqual(content.questions.map((q: { timeLimitSeconds: number | null }) => q.timeLimitSeconds), [10, null]);
    const moderator = (await getModerator(token)).body;
    assert.equal(moderator.questions[0].timeLimitSeconds, 10);
    assert.equal(moderator.questions[0].remainingMs, null);
    assert.equal((await getPublic(code)).body.activeQuestion, null);
    assert.ok(slides.length === 2);
  });

  test("po spuštění běží podle serveru; po vypršení se hlas odmítne (409), dřív přijme", async () => {
    const { token, code, slides } = await createTimed();
    const [timed] = slides;
    assert.equal((await activate(token, timed.id)).status, 200);

    const open = (await getPublic(code)).body.activeQuestion;
    assert.equal(open.timeLimitSeconds, 10);
    assert.ok(open.remainingMs > 8000 && open.remainingMs <= 10000, String(open.remainingMs));
    const moderator = (await getModerator(token)).body.questions[0];
    assert.ok(moderator.remainingMs > 8000 && moderator.remainingMs <= 10000);

    assert.equal((await vote(code, timed.id, timed.options[1].id, "fast")).response.status, 200);

    await expire(timed.id);
    assert.equal((await getPublic(code)).body.activeQuestion.remainingMs, 0);
    const late = await vote(code, timed.id, timed.options[1].id, "slow");
    assert.equal(late.response.status, 409);
    assert.equal(late.body.error, "Čas na odpověď vypršel.");

    const after = (await getModerator(token)).body.questions[0];
    assert.equal(after.totalVotes, 1);
  });

  test("rezerva na síť: hlas těsně po konci (do 1 s) se ještě přijme", async () => {
    const { token, code, slides } = await createTimed();
    const [timed] = slides;
    await activate(token, timed.id);
    await expire(timed.id, 300);
    assert.equal((await vote(code, timed.id, timed.options[0].id, "edge")).response.status, 200);
  });

  test("znovuotevření = nový odpočet; navigace ho spustí také; otázka bez limitu nemá odpočet", async () => {
    const { token, code, slides } = await createTimed();
    const [timed, plain] = slides;
    const navigate = (from: number | null, to: number) =>
      navigateRoute.POST(jsonRequest("/x", "POST", { fromSlideId: from, toSlideId: to }), routeParams({ moderatorToken: token }));

    assert.equal((await navigate(null, timed.id)).status, 200);
    assert.ok((await getPublic(code)).body.activeQuestion.remainingMs > 8000);
    await expire(timed.id);
    assert.equal((await vote(code, timed.id, timed.options[0].id, "late")).response.status, 409);

    assert.equal((await navigate(timed.id, plain.id)).status, 200);
    const plainOpen = (await getPublic(code)).body.activeQuestion;
    assert.equal(plainOpen.remainingMs, null);
    assert.equal(plainOpen.timeLimitSeconds, null);

    // Moderátor otázku znovu otevře → běží znovu celých 10 s.
    assert.equal((await activate(token, timed.id)).status, 200);
    assert.ok((await getPublic(code)).body.activeQuestion.remainingMs > 8000);
    assert.equal((await vote(code, timed.id, timed.options[0].id, "late")).response.status, 200);
    assert.equal((await closeQuestion(token, timed.id)).status, 200);
  });

  test("vynulování odpočet zruší; spuštěná otázka: odpočet už nejde změnit (409)", async () => {
    const { token, code, slides } = await createTimed();
    const [timed] = slides;
    await activate(token, timed.id);
    await vote(code, timed.id, timed.options[1].id, "p1");

    const content = (await getContent(token)).body;
    const payload = {
      version: content.version,
      title: content.title,
      questions: content.questions.map((q: { id: number; text: string; options: unknown[]; link: unknown; correctOptionId: number | null; points: number; speedBonus: boolean; timeLimitSeconds: number | null; images: unknown[] }) => ({
        id: q.id,
        text: q.text,
        options: q.options,
        link: q.link,
        images: q.images,
        points: q.points,
        speedBonus: q.speedBonus,
        correctOptionIndex: (q.options as { id: number }[]).findIndex((o) => o.id === q.correctOptionId) === -1 ? null : (q.options as { id: number }[]).findIndex((o) => o.id === q.correctOptionId),
        timeLimitSeconds: q.timeLimitSeconds,
      })),
    };
    // Beze změny projde.
    const same = await putContent(token, payload);
    assert.equal(same.response.status, 200, JSON.stringify(same.body));
    // Změna odpočtu u spuštěné otázky = změna obsahu → odmítnuto.
    const changed = structuredClone(payload);
    changed.version = same.body.version;
    changed.questions[0].timeLimitSeconds = 30;
    assert.equal((await putContent(token, changed)).response.status, 409);

    const reset = await resetRoute.POST(jsonRequest("/x", "POST"), routeParams({ moderatorToken: token }));
    assert.equal(reset.status, 200);
    const [row] = await testDb.db.select({ deadline: questions.answerDeadline }).from(questions).where(eq(questions.id, timed.id));
    assert.equal(row.deadline, null);
  });
});
