import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { jsonRequest, routeParams, setupTestDb } from "./helpers/db.ts";
import * as navigateRoute from "../app/api/polls/moderator/[moderatorToken]/navigate/route.ts";
import * as resetRoute from "../app/api/polls/moderator/[moderatorToken]/reset/route.ts";
import { activate, closeQuestion, createPoll, getContent, getModerator, getPublic, putContent, vote } from "./helpers/polls.ts";
import { validateCreatePollInput } from "../lib/polls/validate.ts";
import { formatElapsed } from "../lib/polls/format-elapsed.ts";
import { questions } from "../db/schema.ts";

let testDb: Awaited<ReturnType<typeof setupTestDb>>;
before(async () => {
  testDb = await setupTestDb();
});
after(async () => {
  await testDb.close();
});

type Slide = { id: number; status: string; options: { id: number }[]; timer: { elapsedMs: number; running: boolean } | null; showTimer: boolean };

const SLIDES = [
  { kind: "content", text: "Úvod", body: "Vítejte" },
  { text: "Otázka 1", options: [{ text: "A" }, { text: "B" }], correctOptionIndex: 1 },
  { text: "Otázka 2", options: [{ text: "A" }, { text: "B" }] },
  { kind: "content", text: "Pauza", showTimer: true },
];

async function createSlides() {
  const { response, body } = await createPoll({ title: "Čas", questions: SLIDES });
  assert.equal(response.status, 201);
  const token = body.moderatorToken as string;
  const moderator = async () => (await getModerator(token)).body.questions as Slide[];
  const navigate = async (from: number | null, to: number) => {
    const response = await navigateRoute.POST(jsonRequest("/x", "POST", { fromSlideId: from, toSlideId: to }), routeParams({ moderatorToken: token }));
    assert.equal(response.status, 200);
  };
  return { token, code: body.publicCode as string, slides: await moderator(), moderator, navigate };
}

/** Posune začátek počítadla do minulosti (místo čekání). */
async function backdate(questionId: number, msAgo: number) {
  await testDb.db.update(questions).set({ timerStartedAt: new Date(Date.now() - msAgo) }).where(eq(questions.id, questionId));
}

describe("počítadlo uplynulého času", () => {
  test("výchozí: otázka zapnuto, prezentační slajd vypnuto; staré timeLimitSeconds se ignoruje", async () => {
    const result = validateCreatePollInput({
      questions: [
        { text: "Q", options: [{ text: "A" }, { text: "B" }], timeLimitSeconds: 10 },
        { kind: "content", text: "Obsah" },
        { text: "Bez času", options: [{ text: "A" }, { text: "B" }], showTimer: false },
        { kind: "content", text: "S časem", showTimer: true },
      ],
    });
    assert.ok(result.ok);
    assert.deepEqual(
      result.value.questions.map((q) => q.showTimer),
      [true, false, false, true]
    );
    assert.equal("timeLimitSeconds" in result.value.questions[0], false);

    const { slides } = await createSlides();
    assert.deepEqual(slides.map((s) => s.showTimer), [false, true, true, true]);
    // Dokud se slajd nepromítá, čas se nepočítá.
    assert.ok(slides.every((s) => s.timer === null));
  });

  test("čas začíná od nuly a běží podle serveru; vypnutý slajd čas nemá", async () => {
    const { slides, moderator, navigate } = await createSlides();
    const [intro, q1] = slides;
    await navigate(null, intro.id);
    assert.equal((await moderator())[0].timer, null);

    await navigate(intro.id, q1.id);
    const timer = (await moderator())[1].timer;
    assert.ok(timer && timer.running && timer.elapsedMs >= 0 && timer.elapsedMs < 2000, JSON.stringify(timer));
  });

  test("časovač nezamyká odpovědi; hlasy více účastníků fungují", async () => {
    const { code, slides, moderator, navigate } = await createSlides();
    const [, q1] = slides;
    await navigate(null, q1.id);
    await backdate(q1.id, 20 * 60 * 1000);
    for (const [index, participant] of ["p1", "p2", "p3", "p4"].entries()) {
      assert.equal((await vote(code, q1.id, q1.options[index % 2].id, participant)).response.status, 200);
    }
    const now = (await moderator())[1];
    assert.equal(now.status, "active");
    assert.ok(now.timer && now.timer.running && now.timer.elapsedMs >= 20 * 60 * 1000);
    assert.deepEqual(now.options.map((o) => (o as { votes: number }).votes), [2, 2]);
  });

  test("ruční uzamčení funguje a čas se zastaví", async () => {
    const { token, code, slides, moderator, navigate } = await createSlides();
    const [, q1] = slides;
    await navigate(null, q1.id);
    await backdate(q1.id, 65_000);
    assert.equal((await closeQuestion(token, q1.id)).status, 200);
    assert.equal((await vote(code, q1.id, q1.options[0].id, "late")).response.status, 409);

    const first = (await moderator())[1].timer;
    assert.ok(first && !first.running && first.elapsedMs >= 65_000 && first.elapsedMs < 67_000, JSON.stringify(first));
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.deepEqual((await moderator())[1].timer, first);
    assert.equal(formatElapsed(Math.floor(first.elapsedMs / 1000)), "01:05");
  });

  test("přechod mezi slajdy čas resetuje; uzavřená otázka při návratu čas nepočítá; znovuotevření od nuly", async () => {
    const { token, code, slides, moderator, navigate } = await createSlides();
    const [, q1, q2, pause] = slides;
    await navigate(null, q1.id);
    await vote(code, q1.id, q1.options[0].id, "p1");
    await backdate(q1.id, 30_000);

    await navigate(q1.id, q2.id);
    let now = await moderator();
    assert.ok(now[2].timer && now[2].timer.elapsedMs < 2000);
    // Jen promítaný slajd posílá čas.
    assert.equal(now[1].timer, null);

    await backdate(q2.id, 30_000);
    await navigate(q2.id, pause.id);
    now = await moderator();
    assert.ok(now[3].timer && now[3].timer.running && now[3].timer.elapsedMs < 2000);

    await navigate(pause.id, q2.id);
    assert.equal((await moderator())[2].timer, null);

    assert.equal((await activate(token, q2.id)).status, 200);
    const reopened = (await moderator())[2].timer;
    assert.ok(reopened && reopened.running && reopened.elapsedMs < 2000);

    const reset = await resetRoute.POST(jsonRequest("/x", "POST"), routeParams({ moderatorToken: token }));
    assert.equal(reset.status, 200);
    const [row] = await testDb.db.select({ started: questions.timerStartedAt }).from(questions).where(eq(questions.id, q2.id));
    assert.equal(row.started, null);
  });

  test("existující prezentace se starým odpočtem: hlasuje se dál, editor ukládá beze změny", async () => {
    const { token, code, slides, moderator, navigate } = await createSlides();
    const [, q1] = slides;
    // Stav před změnou: limit 10 s a dávno prošlý konec odpočtu.
    await testDb.db.update(questions).set({ timeLimitSeconds: 10 }).where(eq(questions.id, q1.id));
    await navigate(null, q1.id);
    await testDb.db.update(questions).set({ answerDeadline: new Date(Date.now() - 60_000) }).where(eq(questions.id, q1.id));
    assert.equal((await vote(code, q1.id, q1.options[1].id, "p1")).response.status, 200);
    assert.equal("remainingMs" in (await getPublic(code)).body.activeQuestion, false);

    // Starší editor posílá timeLimitSeconds (a showTimer nezná).
    const content = (await getContent(token)).body;
    const payload = {
      version: content.version,
      title: content.title,
      questions: content.questions.map((q: Record<string, unknown> & { options: { id: number }[]; correctOptionId: number | null }) => ({
        id: q.id,
        kind: q.kind,
        text: q.text,
        body: q.body,
        images: q.images,
        link: q.link,
        options: q.options,
        correctOptionIndex: q.options.findIndex((o) => o.id === q.correctOptionId) === -1 ? null : q.options.findIndex((o) => o.id === q.correctOptionId),
        points: q.points,
        speedBonus: q.speedBonus,
        timeLimitSeconds: 10,
      })),
    };
    const saved = await putContent(token, payload);
    assert.equal(saved.response.status, 200, JSON.stringify(saved.body));
    assert.equal((await moderator())[1].showTimer, true);
  });

  test("„Zobrazovat čas“ jde změnit i u spuštěné otázky (jen vzhled)", async () => {
    const { token, slides, moderator, navigate } = await createSlides();
    const [, q1] = slides;
    await navigate(null, q1.id);
    const content = (await getContent(token)).body;
    const payload = {
      version: content.version,
      questions: content.questions.map((q: Record<string, unknown> & { options: { id: number }[]; correctOptionId: number | null }) => ({
        ...q,
        correctOptionIndex: q.options.findIndex((o) => o.id === q.correctOptionId) === -1 ? null : q.options.findIndex((o) => o.id === q.correctOptionId),
        showTimer: q.id === q1.id ? false : q.showTimer,
      })),
    };
    assert.equal((await putContent(token, payload)).response.status, 200);
    const now = (await moderator())[1];
    assert.equal(now.showTimer, false);
    assert.equal(now.timer, null);
  });
});
