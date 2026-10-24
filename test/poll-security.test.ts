import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { setupTestDb } from "./helpers/db.ts";
import { activate, closeQuestion, createPoll, endPoll, getContent, getFinal, getModerator, getPublic, vote } from "./helpers/polls.ts";
import { pollExistsByPublicCode } from "../lib/polls/find-poll.ts";

let testDb: Awaited<ReturnType<typeof setupTestDb>>;
before(async () => {
  testDb = await setupTestDb();
});
after(async () => {
  await testDb.close();
});

describe("A1 — veřejné endpointy neprozrazují budoucí otázky ani výsledky", () => {
  test("veřejný stav před spuštěním neobsahuje žádnou otázku", async () => {
    const { body: created } = await createPoll();
    const { response, text, body } = await getPublic(created.publicCode);
    assert.equal(response.status, 200);
    assert.equal(body.activeQuestion, null);
    assert.equal(body.closedQuestion, null);
    assert.doesNotMatch(text, /TAJNÁ|zranění/);
    assert.doesNotMatch(text, new RegExp(created.moderatorToken));
  });

  test("po spuštění 1. otázky vidí účastník jen ji, ne připravené otázky", async () => {
    const { body: created } = await createPoll();
    await activate(created.moderatorToken, created.questionIds[0]);
    const { text, body } = await getPublic(created.publicCode);
    assert.equal(body.activeQuestion.id, created.questionIds[0]);
    assert.equal(body.activeQuestion.options.length, 3);
    assert.doesNotMatch(text, /TAJNÁ/);
  });

  test("finální výsledky nejdou číst před ukončením hlasování (409, bez dat)", async () => {
    const { body: created } = await createPoll();
    await activate(created.moderatorToken, created.questionIds[0]);
    const { response, text } = await getFinal(created.publicCode);
    assert.equal(response.status, 409);
    assert.doesNotMatch(text, /TAJNÁ|zranění|votes/);
  });

  test("po ukončení vrací finální výsledky jen spuštěné otázky", async () => {
    const { body: created } = await createPoll();
    await activate(created.moderatorToken, created.questionIds[0]);
    await endPoll(created.moderatorToken);
    const { response, text, body } = await getFinal(created.publicCode);
    assert.equal(response.status, 200);
    assert.equal(body.questions.length, 1);
    assert.equal(body.questions[0].id, created.questionIds[0]);
    assert.doesNotMatch(text, /TAJNÁ/);
  });

  test("neexistující kód → 404", async () => {
    assert.equal((await getFinal("999999")).response.status, 404);
    assert.equal((await getPublic("999999")).response.status, 404);
  });

  test("moderátor má přes token přístup ke všem otázkám", async () => {
    const { body: created } = await createPoll();
    const { response, body } = await getModerator(created.moderatorToken);
    assert.equal(response.status, 200);
    assert.equal(body.questions.length, 3);
    const content = await getContent(created.moderatorToken);
    assert.equal(content.body.questions.length, 3);
  });

  test("neplatný moderátorský token → 404", async () => {
    assert.equal((await getModerator("neplatny-token-neplatny-token-x")).response.status, 404);
    assert.equal((await getContent("neplatny-token-neplatny-token-x")).response.status, 404);
  });
});

describe("Odkazy — skryté do vyhodnocení otázky", () => {
  test("odkaz se během hlasování nezobrazí, po ukončení otázky ano", async () => {
    const { body: created } = await createPoll({
      questions: [{ text: "Co je na fotce?", options: [{ text: "A" }, { text: "B" }], link: { url: "https://example.com/odpoved-je-A", label: "Zdroj" } }],
    });
    await activate(created.moderatorToken, created.questionIds[0]);
    const during = await getPublic(created.publicCode);
    assert.equal(during.body.activeQuestion.link, null);
    assert.doesNotMatch(during.text, /odpoved-je-A/);

    assert.equal((await closeQuestion(created.moderatorToken, created.questionIds[0])).status, 200);
    const afterClose = await getPublic(created.publicCode);
    assert.equal(afterClose.body.activeQuestion, null);
    assert.deepEqual(afterClose.body.closedQuestion.link, { url: "https://example.com/odpoved-je-A", label: "Zdroj" });
  });

  test("moderátor může povolit odkaz už během hlasování", async () => {
    const { body: created } = await createPoll({
      questions: [{ text: "Q", options: [{ text: "A" }, { text: "B" }], link: { url: "https://example.com/zdroj-fotky", showDuringVoting: true } }],
    });
    await activate(created.moderatorToken, created.questionIds[0]);
    const { body } = await getPublic(created.publicCode);
    assert.deepEqual(body.activeQuestion.link, { url: "https://example.com/zdroj-fotky", label: null });
  });
});

describe("Životní cyklus otázky", () => {
  test("po ukončení otázky nejde hlasovat; znovuotevření zachová hlasy a nedovolí dvojí hlas", async () => {
    const { body: created } = await createPoll();
    const [q1] = created.questionIds;
    await activate(created.moderatorToken, q1);
    const { body: mod } = await getModerator(created.moderatorToken);
    const optionId = mod.questions[0].options[0].id;

    assert.equal((await vote(created.publicCode, q1, optionId, "student-1")).response.status, 200);
    await closeQuestion(created.moderatorToken, q1);
    assert.equal((await vote(created.publicCode, q1, optionId, "student-2")).response.status, 409);

    await activate(created.moderatorToken, q1);
    assert.equal((await vote(created.publicCode, q1, optionId, "student-1")).response.status, 200); // idempotentní
    assert.equal((await vote(created.publicCode, q1, optionId, "student-2")).response.status, 200);
    const { body: after } = await getModerator(created.moderatorToken);
    assert.equal(after.questions[0].totalVotes, 2);
  });

  test("na ukončené hlasování nejde spustit otázku ani hlasovat", async () => {
    const { body: created } = await createPoll();
    await activate(created.moderatorToken, created.questionIds[0]);
    await endPoll(created.moderatorToken);
    assert.equal((await activate(created.moderatorToken, created.questionIds[1])).status, 409);
    const { body: mod } = await getModerator(created.moderatorToken);
    assert.equal((await vote(created.publicCode, created.questionIds[0], mod.questions[0].options[0].id, "s")).response.status, 409);
  });

  test("hlas na odpověď z jiné otázky se odmítne", async () => {
    const { body: created } = await createPoll();
    await activate(created.moderatorToken, created.questionIds[0]);
    const { body: mod } = await getModerator(created.moderatorToken);
    const foreignOption = mod.questions[1].options[0].id;
    assert.equal((await vote(created.publicCode, created.questionIds[0], foreignOption, "s")).response.status, 400);
  });
});

describe("A3 — skutečné 404 pro neplatné URL hlasování", () => {
  test("pollExistsByPublicCode", async () => {
    const { body: created } = await createPoll();
    assert.equal(await pollExistsByPublicCode(created.publicCode), true);
    assert.equal(await pollExistsByPublicCode("000000"), false);
    assert.equal(await pollExistsByPublicCode("ochrana-osobnich-udaju"), false);
    assert.equal(await pollExistsByPublicCode("12345"), false);
  });
});
