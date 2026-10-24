import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { jsonRequest, routeParams, setupTestDb, uniqueIp } from "./helpers/db.ts";
import { activate, closeQuestion, createPoll, endPoll, getFinal, getModerator, getPublic, vote } from "./helpers/polls.ts";
import * as participantRoute from "../app/api/polls/public/[publicCode]/participant/route.ts";
import * as responsesRoute from "../app/api/polls/moderator/[moderatorToken]/responses/route.ts";
import * as responsesCsvRoute from "../app/api/polls/moderator/[moderatorToken]/responses-csv/route.ts";
import { participants, polls, votes } from "../db/schema.ts";
import { normalizeParticipantName } from "../lib/polls/validate.ts";
import { runCleanup } from "../lib/maintenance/cleanup.ts";
import { overallSuccess, questionSuccess } from "../lib/polls/stats.ts";
import { RESPONSES_PAGE_SIZE } from "../lib/polls/get-question-responses.ts";

let testDb: Awaited<ReturnType<typeof setupTestDb>>;
before(async () => {
  testDb = await setupTestDb();
});
after(async () => {
  await testDb.close();
});

const QUIZ = [
  { text: "Kolik je 2 + 2?", options: [{ text: "3" }, { text: "4" }], correctOptionIndex: 1 },
  { text: "Oblíbená barva?", options: [{ text: "Modrá" }, { text: "Zelená" }] },
  { text: "Nespuštěná", options: [{ text: "A" }, { text: "B" }], correctOptionIndex: 0 },
];

async function register(code: string, participantId: unknown, name: unknown, ip = uniqueIp()) {
  const response = await participantRoute.POST(jsonRequest("/x", "POST", { participantId, name }, ip), routeParams({ publicCode: code }));
  return { response, body: await response.json() };
}

async function responses(token: string, questionId: number, offset = 0) {
  const response = await responsesRoute.GET(
    jsonRequest(`/api/polls/moderator/${token}/responses?questionId=${questionId}&offset=${offset}`, "GET"),
    routeParams({ moderatorToken: token })
  );
  return { response, body: await response.json() };
}

async function setup(requireParticipantName: boolean) {
  const { response, body } = await createPoll({ title: "Kvíz", questions: QUIZ, requireParticipantName });
  assert.equal(response.status, 201);
  const token: string = body.moderatorToken;
  const { body: mod } = await getModerator(token);
  const optionIds = mod.questions.map((q: { options: { id: number }[] }) => q.options.map((o) => o.id));
  return { token, code: body.publicCode as string, questionIds: body.questionIds as number[], optionIds };
}

/** Q1 (kvíz): p1 správně, p2 špatně, p3 správně. Q2 (anketa): p2, p1. Q3 nespuštěná. */
async function runQuiz(poll: Awaited<ReturnType<typeof setup>>) {
  const [q1, q2] = poll.questionIds;
  await activate(poll.token, q1);
  for (const [p, index] of [["p1", 1], ["p2", 0], ["p3", 1]] as const) {
    assert.equal((await vote(poll.code, q1, poll.optionIds[0][index], p)).response.status, 200);
  }
  await closeQuestion(poll.token, q1);
  await activate(poll.token, q2);
  await vote(poll.code, q2, poll.optionIds[1][0], "p2");
  await vote(poll.code, q2, poll.optionIds[1][1], "p1");
  await endPoll(poll.token);
}

describe("validace jména", () => {
  test("ořez, mezery, délka, obsah", () => {
    assert.equal(normalizeParticipantName("  Jana   Nováková "), "Jana Nováková");
    assert.equal(normalizeParticipantName("x".repeat(40)), "x".repeat(40));
    assert.equal(normalizeParticipantName("x".repeat(41)), null);
    assert.equal(normalizeParticipantName("   "), null);
    assert.equal(normalizeParticipantName("!!!"), null);
    assert.equal(normalizeParticipantName("Jana\u0000"), null);
    assert.equal(normalizeParticipantName("Ja‮na"), null, "bidi/neviditelné znaky");
    assert.equal(normalizeParticipantName(42), null);
  });
});

describe("anonymní hlasování (výchozí, beze změny)", () => {
  test("hlasuje se bez jména, registrace jména nejde, výchozí režim je anonymní", async () => {
    const poll = await setup(false);
    const { body: pub } = await getPublic(poll.code);
    assert.equal(pub.requireParticipantName, false);
    await activate(poll.token, poll.questionIds[0]);
    assert.equal((await vote(poll.code, poll.questionIds[0], poll.optionIds[0][0], "anon")).response.status, 200);
    assert.equal((await register(poll.code, "anon", "Jana")).response.status, 409);
    const rows = await testDb.db.select().from(participants);
    assert.equal(rows.filter((row) => row.participantId === "anon").length, 0);
  });

  test("detail odpovědí: stabilní anonymní štítky, žádná ID", async () => {
    const poll = await setup(false);
    await runQuiz(poll);
    const { body: first } = await responses(poll.token, poll.questionIds[0]);
    assert.deepEqual(first.rows, [
      { label: "Anonymní účastník 1", optionText: "4", correct: true },
      { label: "Anonymní účastník 2", optionText: "3", correct: false },
      { label: "Anonymní účastník 3", optionText: "4", correct: true },
    ]);
    const { body: second } = await responses(poll.token, poll.questionIds[1]);
    // p1 i p2 mají stejné číslo jako u první otázky; anketa nemá výsledek.
    assert.deepEqual(second.rows, [
      { label: "Anonymní účastník 1", optionText: "Zelená", correct: null },
      { label: "Anonymní účastník 2", optionText: "Modrá", correct: null },
    ]);
    assert.doesNotMatch(JSON.stringify([first, second]), /"p[123]"/);
  });
});

describe("jmenovité hlasování", () => {
  test("bez jména nelze hlasovat; jméno se uloží jednou, hlas nevytvoří", async () => {
    const poll = await setup(true);
    const [q1] = poll.questionIds;
    await activate(poll.token, q1);
    const { body: pub } = await getPublic(poll.code);
    assert.equal(pub.requireParticipantName, true);

    const denied = await vote(poll.code, q1, poll.optionIds[0][1], "n1");
    assert.equal(denied.response.status, 403);

    const first = await register(poll.code, "n1", "  Jana ");
    assert.equal(first.response.status, 200);
    assert.deepEqual(first.body, { name: "Jana" });
    const [{ pollId }] = await testDb.db.select({ pollId: polls.id }).from(polls).where(eq(polls.publicCode, poll.code));
    const voteCount = async () => (await testDb.db.select().from(votes).where(eq(votes.questionId, q1))).length;
    assert.equal(await voteCount(), 0, "registrace nevytváří hlas");

    // Opakovaná / souběžná registrace: jeden řádek, platí první jméno.
    const again = await Promise.all([register(poll.code, "n1", "Jiné"), register(poll.code, "n1", "Další")]);
    for (const { body } of again) assert.deepEqual(body, { name: "Jana" });
    const rows = await testDb.db.select().from(participants).where(eq(participants.pollId, pollId));
    assert.equal(rows.length, 1);

    assert.equal((await vote(poll.code, q1, poll.optionIds[0][1], "n1")).response.status, 200);
    assert.equal((await vote(poll.code, q1, poll.optionIds[0][0], "n1")).response.status, 200, "idempotentní");
    assert.equal(await voteCount(), 1, "ochrana proti dvojímu hlasu platí dál");
  });

  test("neplatné jméno, cizí/neexistující/ukončené hlasování", async () => {
    const poll = await setup(true);
    assert.equal((await register(poll.code, "n1", "")).response.status, 400);
    assert.equal((await register(poll.code, "n1", "x".repeat(41))).response.status, 400);
    assert.equal((await register(poll.code, "", "Jana")).response.status, 400);
    assert.equal((await register("000000", "n1", "Jana")).response.status, 404);
    await endPoll(poll.token);
    assert.equal((await register(poll.code, "n1", "Jana")).response.status, 409);
  });

  test("veřejné API ani finální výsledky nevrací jména", async () => {
    const poll = await setup(true);
    for (const p of ["p1", "p2", "p3"]) await register(poll.code, p, `TAJNÉ-JMÉNO-${p}`);
    await runQuiz(poll);
    const { text: pub } = await getPublic(poll.code);
    const { text: final } = await getFinal(poll.code, "p1");
    assert.doesNotMatch(pub + final, /TAJNÉ-JMÉNO/);
  });

  test("moderátor vidí jména a odpovědi, stejná jména rozliší, CSV", async () => {
    const poll = await setup(true);
    await register(poll.code, "p1", "Jana");
    await register(poll.code, "p2", "Petr");
    await register(poll.code, "p3", "jana");
    await runQuiz(poll);
    const { body } = await responses(poll.token, poll.questionIds[0]);
    assert.deepEqual(
      body.rows.map((row: { label: string; correct: boolean }) => [row.label, row.correct]),
      [["Jana (1)", true], ["Petr", false], ["jana (2)", true]]
    );

    const csvResponse = await responsesCsvRoute.GET(jsonRequest("/x", "GET"), routeParams({ moderatorToken: poll.token }));
    assert.equal(csvResponse.status, 200);
    const bytes = new Uint8Array(await csvResponse.clone().arrayBuffer());
    assert.deepEqual([...bytes.slice(0, 3)], [0xef, 0xbb, 0xbf], "BOM pro Excel");
    const csv = await csvResponse.text();
    assert.match(csv, /^Otázka;Účastník;Odpověď;Výsledek/);
    assert.match(csv, /1\. Kolik je 2 \+ 2\?;Petr;3;nesprávně/);
    assert.match(csv, /2\. Oblíbená barva\?;Jana \(1\);Zelená;\r\n/);
    assert.doesNotMatch(csv, /Nespuštěná/);
  });

  test("úklid: jména vypršelého hlasování se smažou, hlasy zůstanou", async () => {
    const poll = await setup(true);
    await register(poll.code, "p1", "Jana");
    await register(poll.code, "p2", "Petr");
    await register(poll.code, "p3", "Eva");
    await runQuiz(poll);
    const [{ pollId }] = await testDb.db.select({ pollId: polls.id }).from(polls).where(eq(polls.publicCode, poll.code));

    await runCleanup();
    assert.equal((await testDb.db.select().from(participants).where(eq(participants.pollId, pollId))).length, 3, "běžící hlasování se nemaže");

    await testDb.db.update(polls).set({ expiresAt: new Date(Date.now() - 8 * 24 * 3600_000) }).where(eq(polls.id, pollId));
    const summary = await runCleanup();
    assert.ok(summary.participantNamesDeleted >= 3);
    assert.equal((await testDb.db.select().from(participants).where(eq(participants.pollId, pollId))).length, 0);
    assert.equal((await testDb.db.select().from(votes).where(eq(votes.questionId, poll.questionIds[0]))).length, 3);
  });
});

describe("přístup jen s moderátorským tokenem", () => {
  test("neplatný token, cizí otázka, špatné parametry", async () => {
    const a = await setup(false);
    const b = await setup(true);
    await runQuiz(a);
    assert.equal((await responses("neplatny-token-neplatny-token-xx", a.questionIds[0])).response.status, 404);
    assert.equal((await responses(b.token, a.questionIds[0])).response.status, 404, "otázka jiného hlasování");
    assert.equal((await responses(a.token, -1)).response.status, 400);
    const csvBad = await responsesCsvRoute.GET(jsonRequest("/x", "GET"), routeParams({ moderatorToken: "neplatny-token-neplatny-token-xx" }));
    assert.equal(csvBad.status, 404);
    const csvAnon = await responsesCsvRoute.GET(jsonRequest("/x", "GET"), routeParams({ moderatorToken: a.token }));
    assert.equal(csvAnon.status, 409, "anonymní hlasování nemá jmenovité CSV");
  });
});

describe("souhrnné statistiky", () => {
  test("počty a úspěšnost jen ze spuštěných kvízových otázek", async () => {
    const poll = await setup(false);
    await runQuiz(poll);
    const { body: mod } = await getModerator(poll.token);
    assert.equal(mod.uniqueParticipants, 3);
    assert.equal(mod.totalVotes, 5);
    assert.equal(mod.requireParticipantName, false);
    const launched = mod.questions.filter((q: { status: string }) => q.status !== "prepared");
    assert.equal(launched.length, 2);
    assert.equal(questionSuccess(mod.questions[0]), 67);
    assert.equal(questionSuccess(mod.questions[1]), null, "anketa bez správné odpovědi");
    assert.deepEqual(overallSuccess(launched), { percent: 67 }, "nespuštěná kvízová otázka se nepočítá");
    assert.equal(overallSuccess([mod.questions[1]]), null, "bez kvízových otázek se úspěšnost nezobrazí");
  });

  test("stránkování detailu odpovědí (víc než jedna stránka)", async () => {
    const poll = await setup(false);
    await activate(poll.token, poll.questionIds[0]);
    const count = RESPONSES_PAGE_SIZE + 5;
    const optionId = poll.optionIds[0][0];
    await testDb.db.insert(votes).values(Array.from({ length: count }, (_, i) => ({ questionId: poll.questionIds[0], optionId, participantId: `bulk-${i}` })));
    const { body: page1 } = await responses(poll.token, poll.questionIds[0]);
    assert.equal(page1.total, count);
    assert.equal(page1.rows.length, RESPONSES_PAGE_SIZE);
    const { body: page2 } = await responses(poll.token, poll.questionIds[0], RESPONSES_PAGE_SIZE);
    assert.equal(page2.rows.length, 5);
    assert.equal(page2.rows[4].label, `Anonymní účastník ${count}`);
    assert.equal(page1.rows[0].correct, null, "otázka ještě běží → bez vyhodnocení");
  });
});

