import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { pngBytes, routeParams, setupTestDb, uniqueIp } from "./helpers/db.ts";
import * as imagesRoute from "../app/api/polls/moderator/[moderatorToken]/images/route.ts";
import { MOCK_CONTENT_API_TOKEN, startMockContentApi, type MockContentApi } from "./helpers/content-api-mock.ts";
import {
  activate,
  closeQuestion,
  contentToPayload,
  createPoll,
  endPoll,
  getContent,
  getFinal,
  getModerator,
  getPublic,
  putContent,
  vote,
} from "./helpers/polls.ts";
import { validateCreatePollInput, validateUpdatePollInput } from "../lib/polls/validate.ts";
import { buildResultsCsv, buildResultsEmail } from "../lib/email/send-results-email.ts";

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

const QUIZ = [
  { text: "Kolik je 2 + 2?", options: [{ text: "3" }, { text: "4" }, { text: "5" }], correctOptionIndex: 1 },
  { text: "Běžná anketa", options: [{ text: "Ano" }, { text: "Ne" }] },
];

async function createQuiz() {
  const { response, body } = await createPoll({ title: "Kvíz", questions: QUIZ });
  assert.equal(response.status, 201);
  const { body: mod } = await getModerator(body.moderatorToken);
  return { token: body.moderatorToken as string, code: body.publicCode as string, mod };
}

describe("správná odpověď — validace", () => {
  test("nejvýš jedna správná odpověď z principu (index), neplatný index se odmítne", () => {
    const base = { questions: [{ text: "Q", options: [{ text: "A" }, { text: "B" }] }] };
    assert.equal(validateCreatePollInput(base).ok, true);
    for (const bad of [2, -1, 0.5, "1", [0, 1], true]) {
      const result = validateCreatePollInput({ questions: [{ ...base.questions[0], correctOptionIndex: bad }] });
      assert.equal(result.ok, false, `correctOptionIndex=${JSON.stringify(bad)} se má odmítnout`);
    }
    const ok = validateUpdatePollInput({ version: 1, questions: [{ ...base.questions[0], correctOptionIndex: 0 }] });
    assert.equal(ok.ok && ok.value.questions[0].correctOptionIndex, 0);
  });
});

describe("správná odpověď — hlasování", () => {
  test("otázka bez správné odpovědi funguje jako běžná anketa", async () => {
    const { token, code, mod } = await createQuiz();
    const plain = mod.questions[1];
    assert.equal(plain.correctOptionId, null);
    await activate(token, plain.id);
    assert.equal((await vote(code, plain.id, plain.options[0].id, "p1")).response.status, 200);
    await closeQuestion(token, plain.id);
    const { body } = await getPublic(code);
    assert.equal(body.closedQuestion.id, plain.id);
    assert.equal(body.closedQuestion.correctOptionId, null);
  });

  test("lze nastavit jednu správnou odpověď při vytvoření i v editoru a zase ji zrušit", async () => {
    const { token, mod } = await createQuiz();
    assert.equal(mod.questions[0].correctOptionId, mod.questions[0].options[1].id);

    const { body: content } = await getContent(token);
    const payload = contentToPayload(content);
    payload.questions[1].correctOptionIndex = 0;
    payload.questions[0].correctOptionIndex = null;
    assert.equal((await putContent(token, payload)).response.status, 200);

    const { body: after } = await getContent(token);
    assert.equal(after.questions[0].correctOptionId, null);
    assert.equal(after.questions[1].correctOptionId, after.questions[1].options[0].id);
  });

  test("nová odpověď přidaná v editoru může být správná; smazaná správná odpověď ji zruší", async () => {
    const { token } = await createQuiz();
    const { body: content } = await getContent(token);
    const payload = contentToPayload(content);
    payload.questions[1].options.push({ text: "Nevím" } as never);
    payload.questions[1].correctOptionIndex = 2;
    assert.equal((await putContent(token, payload)).response.status, 200);
    const { body: after } = await getContent(token);
    const added = after.questions[1].options[2];
    assert.equal(added.text, "Nevím");
    assert.equal(after.questions[1].correctOptionId, added.id);

    // Odstranění správné odpovědi (editor pošle index -1 → null).
    const next = contentToPayload(after);
    next.questions[1].options = next.questions[1].options.slice(0, 2);
    next.questions[1].correctOptionIndex = null;
    assert.equal((await putContent(token, next)).response.status, 200);
    assert.equal((await getContent(token)).body.questions[1].correctOptionId, null);
  });

  test("po spuštění nelze správnou odpověď změnit ani zrušit; přeřazení otázky projde", async () => {
    const { token, mod } = await createQuiz();
    await activate(token, mod.questions[0].id);
    const { body: content } = await getContent(token);

    for (const change of [0, null]) {
      const payload = contentToPayload(content);
      payload.questions[0].correctOptionIndex = change;
      const { response } = await putContent(token, payload);
      assert.equal(response.status, 409, `změna na ${change} se má odmítnout`);
    }

    const reordered = contentToPayload(content);
    reordered.questions.reverse();
    assert.equal((await putContent(token, reordered)).response.status, 200);
    const { body: after } = await getModerator(token);
    const quiz = after.questions.find((q: { id: number }) => q.id === mod.questions[0].id);
    assert.equal(quiz.correctOptionId, mod.questions[0].options[1].id);
  });

  test("během hlasování (i po znovuotevření) správná odpověď neunikne do veřejného API; po ukončení ano", async () => {
    const { token, code, mod } = await createQuiz();
    const quiz = mod.questions[0];
    const correctId = quiz.options[1].id;
    const leaks = (text: string) => /correct/i.test(text);

    // Připravená otázka: nic veřejně.
    assert.equal(leaks((await getPublic(code)).text), false);

    await activate(token, quiz.id);
    const live = await getPublic(code);
    assert.equal(live.body.activeQuestion.id, quiz.id);
    assert.equal(leaks(live.text), false, "aktivní otázka nesmí nést správnou odpověď");
    await vote(code, quiz.id, correctId, "p1");
    await vote(code, quiz.id, quiz.options[0].id, "p2");

    await closeQuestion(token, quiz.id);
    const closed = await getPublic(code);
    assert.equal(closed.body.closedQuestion.correctOptionId, correctId);
    assert.deepEqual(
      closed.body.closedQuestion.options.map((o: { text: string }) => o.text),
      ["3", "4", "5"]
    );
    assert.equal(JSON.stringify(closed.body).includes("votes"), false, "účastník nedostává průběžné počty hlasů");

    // Znovuotevření: zase skryté.
    await activate(token, quiz.id);
    const reopened = await getPublic(code);
    assert.equal(reopened.body.activeQuestion.id, quiz.id);
    assert.equal(reopened.body.closedQuestion, null);
    assert.equal(leaks(reopened.text), false, "znovuotevřená otázka nesmí nést správnou odpověď");

    // Finální výsledky jsou až po ukončení celého hlasování.
    assert.equal((await getFinal(code)).response.status, 409);
    await endPoll(token);
    const final = await getFinal(code, "p1");
    const finalQuiz = final.body.questions.find((q: { id: number }) => q.id === quiz.id);
    assert.equal(finalQuiz.correctOptionId, correctId);
    assert.equal(finalQuiz.participantSelectedOptionId, correctId);
    assert.deepEqual(
      finalQuiz.options.map((o: { votes: number }) => o.votes),
      [1, 1, 0],
      "počty hlasů zůstávají"
    );
  });

  test("moderátor vidí správnou odpověď ve své konzoli i během hlasování", async () => {
    const { token, mod } = await createQuiz();
    await activate(token, mod.questions[0].id);
    const { body } = await getModerator(token);
    assert.equal(body.questions[0].correctOptionId, mod.questions[0].options[1].id);
  });

  test("obrázek a odkaz se uloží spolu se správnou odpovědí", async () => {
    const { token } = await createQuiz();
    const form = new FormData();
    form.append("file", new File([pngBytes(800, 600) as Uint8Array<ArrayBuffer>], "a.png", { type: "image/png" }));
    const upload = await imagesRoute.POST(
      new Request("http://localhost/x", { method: "POST", body: form, headers: { "x-forwarded-for": uniqueIp() } }),
      routeParams({ moderatorToken: token })
    );
    const uploadText = await upload.text();
    assert.equal(upload.status, 201, uploadText);
    assert.equal(uploadText.includes(MOCK_CONTENT_API_TOKEN), false);
    const image = JSON.parse(uploadText);

    const { body: content } = await getContent(token);
    const payload = contentToPayload(content);
    payload.questions[0].image = { url: image.url, width: image.width, height: image.height, alt: "Obrázek" };
    payload.questions[0].link = { url: "https://example.cz/vysvetleni", label: "Vysvětlení", showDuringVoting: false };
    assert.equal((await putContent(token, payload)).response.status, 200);

    const { body: after } = await getContent(token);
    assert.equal(after.questions[0].image.url, image.url);
    assert.equal(after.questions[0].link.url, "https://example.cz/vysvetleni");
    assert.equal(after.questions[0].correctOptionId, after.questions[0].options[1].id);
  });
});

describe("správná odpověď — e-mail a CSV", () => {
  const input = {
    title: "Kvíz",
    publicCode: "123456",
    createdAt: new Date("2026-10-24T10:00:00Z"),
    uniqueParticipants: 2,
    questions: [
      { text: "Kolik je 2 + 2?", totalVotes: 2, correctOptionId: 2, options: [{ id: 1, text: "3", votes: 1 }, { id: 2, text: "4", votes: 1 }] },
      { text: "Anketa", totalVotes: 0, correctOptionId: null, options: [{ id: 3, text: "Ano", votes: 0 }] },
    ],
  };

  test("CSV má sloupec Správná, e-mail označí správnou odpověď", () => {
    const csv = buildResultsCsv(input);
    assert.match(csv, /^﻿Otázka;Odpověď;Hlasy;Procenta;Správná\r\n/);
    assert.match(csv, /1\. Kolik je 2 \+ 2\?;4;1;50 %;ano\r\n/);
    assert.match(csv, /1\. Kolik je 2 \+ 2\?;3;1;50 %;\r\n/);
    assert.match(csv, /2\. Anketa;Ano;0;0 %;\r\n/);
    const email = buildResultsEmail(input);
    assert.match(email.text, /✓ 4: 50 % \(1 hlas\) – správná odpověď/);
    assert.match(email.text, /   3: 50 % \(1 hlas\)\n/);
    assert.match(email.html, /správná odpověď/);
  });
});
