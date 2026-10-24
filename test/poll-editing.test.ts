import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { count, eq } from "drizzle-orm";
import { setupTestDb } from "./helpers/db.ts";
import { activate, contentToPayload, createPoll, endPoll, getContent, getModerator, putContent, vote } from "./helpers/polls.ts";
import { options, questions, votes } from "../db/schema.ts";

let testDb: Awaited<ReturnType<typeof setupTestDb>>;
before(async () => {
  testDb = await setupTestDb();
});
after(async () => {
  await testDb.close();
});

async function freshPoll() {
  const { body: created } = await createPoll();
  const { body: content } = await getContent(created.moderatorToken);
  return { created, content };
}

describe("D — editace hlasování", () => {
  test("neautorizovaný uživatel nemůže editovat (špatný token → 404)", async () => {
    const { content } = await freshPoll();
    const { response } = await putContent("cizi-token-cizi-token-cizi-token-xx", contentToPayload(content));
    assert.equal(response.status, 404);
  });

  test("připravenou otázku lze upravit, přidat, odebrat a přeřadit", async () => {
    const { created, content } = await freshPoll();
    const payload = contentToPayload(content);
    payload.title = "Nový název";
    payload.questions[0].text = "Upravený text";
    payload.questions[0].options.push({ text: "Nová odpověď" } as never);
    payload.questions = [payload.questions[2], payload.questions[0]]; // přeřazení + smazání 2. otázky
    payload.questions.push({ text: "Úplně nová", image: null, link: null, options: [{ text: "X" }, { text: "Y" }] } as never);

    const { response, body } = await putContent(created.moderatorToken, payload);
    assert.equal(response.status, 200);
    assert.equal(body.version, 2);
    assert.equal(body.title, "Nový název");
    assert.deepEqual(
      body.questions.map((q: { text: string }) => q.text),
      ["TAJNÁ TŘETÍ OTÁZKA", "Upravený text", "Úplně nová"]
    );
    assert.equal(body.questions[1].options.length, 4);
    assert.equal(body.questions[1].id, content.questions[0].id, "ID upravené otázky zůstává");
  });

  test("opakované uložení nevytváří duplicity a ID odpovědí jsou stabilní", async () => {
    const { created, content } = await freshPoll();
    const first = await putContent(created.moderatorToken, contentToPayload(content));
    const second = await putContent(created.moderatorToken, contentToPayload(first.body));
    assert.equal(second.response.status, 200);
    assert.equal(second.body.questions.length, 3);
    assert.deepEqual(second.body.questions[0].options, content.questions[0].options);

    const pollId = await testDb.db.select({ pollId: questions.pollId }).from(questions).where(eq(questions.id, content.questions[0].id));
    const [{ value }] = await testDb.db.select({ value: count() }).from(questions).where(eq(questions.pollId, pollId[0].pollId));
    assert.equal(value, 3);
  });

  test("souběžná editace ve dvou oknech: starší verze se odmítne (409), nic se nepřepíše", async () => {
    const { created, content } = await freshPoll();
    const windowA = contentToPayload(content);
    const windowB = contentToPayload(content);
    windowA.questions[0].text = "Z okna A";
    windowB.questions[0].text = "Z okna B";
    assert.equal((await putContent(created.moderatorToken, windowA)).response.status, 200);
    const conflict = await putContent(created.moderatorToken, windowB);
    assert.equal(conflict.response.status, 409);
    assert.equal(conflict.body.code, "version_conflict");
    const { body: current } = await getContent(created.moderatorToken);
    assert.equal(current.questions[0].text, "Z okna A");
  });

  test("aktivní otázku nelze změnit ani smazat; připravené lze upravit i během prezentace", async () => {
    const { created, content } = await freshPoll();
    await activate(created.moderatorToken, content.questions[0].id);
    const { body: locked } = await getContent(created.moderatorToken);
    assert.equal(locked.questions[0].locked, true);
    assert.equal(locked.questions[1].locked, false);

    const changeActive = contentToPayload(locked);
    changeActive.questions[0].options[0].text = "Jiná odpověď";
    const rejected = await putContent(created.moderatorToken, changeActive);
    assert.equal(rejected.response.status, 409);
    assert.equal(rejected.body.code, "invalid_change");

    const removeActive = contentToPayload(locked);
    removeActive.questions.shift();
    assert.equal((await putContent(created.moderatorToken, removeActive)).response.status, 409);

    const editPrepared = contentToPayload(locked);
    editPrepared.questions[1].text = "Upraveno během prezentace";
    editPrepared.questions.reverse(); // pořadí jde měnit i u zamčené otázky
    const ok = await putContent(created.moderatorToken, editPrepared);
    assert.equal(ok.response.status, 200);
    assert.equal(ok.body.questions[1].text, "Upraveno během prezentace");
    assert.equal(ok.body.questions[2].id, content.questions[0].id);
  });

  test("ukončenou otázku nelze změnit a existující hlasy zůstanou zachované", async () => {
    const { created, content } = await freshPoll();
    const [q1, q2] = content.questions;
    await activate(created.moderatorToken, q1.id);
    await vote(created.publicCode, q1.id, q1.options[1].id, "student-a");
    await vote(created.publicCode, q1.id, q1.options[1].id, "student-b");
    await activate(created.moderatorToken, q2.id); // q1 → ended

    const { body: current } = await getContent(created.moderatorToken);
    const payload = contentToPayload(current);
    payload.questions[0].options = payload.questions[0].options.slice(0, 1).concat({ text: "Přepsaná" } as never);
    assert.equal((await putContent(created.moderatorToken, payload)).response.status, 409);

    const reorderOnly = contentToPayload(current);
    reorderOnly.questions.reverse();
    reorderOnly.questions[0].text = "Upravená třetí";
    assert.equal((await putContent(created.moderatorToken, reorderOnly)).response.status, 200);

    const [{ value }] = await testDb.db.select({ value: count() }).from(votes).where(eq(votes.questionId, q1.id));
    assert.equal(value, 2);
    const { body: mod } = await getModerator(created.moderatorToken);
    const q1View = mod.questions.find((q: { id: number }) => q.id === q1.id);
    assert.equal(q1View.options[1].votes, 2);
    assert.equal(q1View.options[1].text, q1.options[1].text);
  });

  test("ukončené hlasování je uzamčené", async () => {
    const { created, content } = await freshPoll();
    await endPoll(created.moderatorToken);
    const { response, body } = await putContent(created.moderatorToken, contentToPayload(content));
    assert.equal(response.status, 409);
    assert.equal(body.code, "poll_closed");
  });

  test("cizí ID odpovědi / otázky se odmítne", async () => {
    const a = await freshPoll();
    const b = await freshPoll();
    const payload = contentToPayload(a.content);
    payload.questions[0].options[0].id = b.content.questions[0].options[0].id;
    assert.equal((await putContent(a.created.moderatorToken, payload)).response.status, 409);

    const foreignQuestion = contentToPayload(a.content);
    foreignQuestion.questions[0].id = b.content.questions[0].id;
    assert.equal((await putContent(a.created.moderatorToken, foreignQuestion)).response.status, 409);
    const [{ value }] = await testDb.db.select({ value: count() }).from(options).where(eq(options.questionId, b.content.questions[0].id));
    assert.equal(value, 3, "cizí hlasování zůstalo netknuté");
  });
});
