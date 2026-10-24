import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { setupTestDb, uniqueIp } from "./helpers/db.ts";
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
  SAMPLE_QUESTIONS,
  vote,
} from "./helpers/polls.ts";
import { polls, votes } from "../db/schema.ts";
import { getSharePreview } from "../lib/polls/find-poll.ts";
import { pollPageMetadata } from "../lib/polls/share-metadata.ts";
import { buildPollCreatedEmail } from "../lib/email/send-poll-created-email.ts";
import { buildResultsEmail } from "../lib/email/send-results-email.ts";
import { RATE_LIMITS } from "../lib/rate-limit.ts";

let testDb: Awaited<ReturnType<typeof setupTestDb>>;
before(async () => {
  testDb = await setupTestDb();
});
after(async () => {
  await testDb.close();
});

const DAY = 24 * 3600_000;
const QUESTION = { text: "Kam na výlet?", options: [{ text: "Hory" }, { text: "Moře" }, { text: "Město" }], correctOptionIndex: 1 };

async function createSelfService(question: Record<string, unknown> = QUESTION, extra: Record<string, unknown> = {}) {
  const { response, body } = await createPoll({ title: "Výlet", mode: "self_service", questions: [question], ...extra });
  assert.equal(response.status, 201, JSON.stringify(body));
  const { body: mod } = await getModerator(body.moderatorToken);
  return {
    token: body.moderatorToken as string,
    code: body.publicCode as string,
    questionId: body.questionIds[0] as number,
    optionIds: mod.questions[0].options.map((o: { id: number }) => o.id) as number[],
  };
}

describe("validace vytvoření", () => {
  test("anketa pro web: právě jedna otázka, vždy anonymní, známý režim", async () => {
    const two = await createPoll({ mode: "self_service", questions: SAMPLE_QUESTIONS.slice(0, 2) });
    assert.equal(two.response.status, 400);
    const named = await createPoll({ mode: "self_service", requireParticipantName: true, questions: [QUESTION] });
    assert.equal(named.response.status, 400);
    const unknown = await createPoll({ mode: "public", questions: [QUESTION] });
    assert.equal(unknown.response.status, 400);
    const eleven = await createPoll({ mode: "self_service", questions: [{ text: "Q", options: Array.from({ length: 11 }, (_, i) => ({ text: `o${i}` })) }] });
    assert.equal(eleven.response.status, 400, "max 10 možností");
  });
});

describe("původní živé hlasování beze změny", () => {
  test("výchozí režim live, otázky čekají na moderátora", async () => {
    const { body } = await createPoll({ title: "Živé", questions: SAMPLE_QUESTIONS });
    const [row] = await testDb.db.select().from(polls).where(eq(polls.publicCode, body.publicCode));
    assert.equal(row.mode, "live");
    assert.equal(row.activeQuestionId, null);
    const { body: pub } = await getPublic(body.publicCode);
    assert.equal(pub.mode, "live");
    assert.equal(pub.activeQuestion, null);
    const { body: mod } = await getModerator(body.moderatorToken);
    assert.equal((await vote(body.publicCode, body.questionIds[0], mod.questions[0].options[0].id, "p1")).response.status, 409);
    assert.equal((await activate(body.moderatorToken, body.questionIds[0])).status, 200);
    assert.equal((await vote(body.publicCode, body.questionIds[0], mod.questions[0].options[0].id, "p1")).response.status, 200);
    // Průběžné výsledky živého hlasování dál jen po ukončení (i po hlasu).
    assert.equal((await getFinal(body.publicCode, "p1")).response.status, 409);
    assert.equal(await getSharePreview(body.publicCode), null, "otázky živého hlasování se do náhledů nedostanou");
    const meta = pollPageMetadata(body.publicCode, null);
    assert.equal(meta.openGraph, undefined);
    assert.doesNotMatch(JSON.stringify(meta), /TAJNÁ|zranění/);
  });
});

describe("veřejná anketa", () => {
  test("přijímá hlasy hned bez moderátora; opakovaný hlas se nezapočítá", async () => {
    const poll = await createSelfService();
    const { body: pub } = await getPublic(poll.code);
    assert.equal(pub.mode, "self_service");
    assert.equal(pub.activeQuestion.id, poll.questionId);
    assert.equal(pub.activeQuestion.correctOptionId, undefined);

    assert.equal((await vote(poll.code, poll.questionId, poll.optionIds[0], "a")).response.status, 200);
    assert.equal((await vote(poll.code, poll.questionId, poll.optionIds[2], "a")).response.status, 200, "idempotentní jako dřív");
    const rows = await testDb.db.select().from(votes).where(eq(votes.questionId, poll.questionId));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].optionId, poll.optionIds[0], "první hlas platí");
  });

  test("výsledky až po hlasu, správné počty, správná odpověď skrytá do ukončení", async () => {
    const poll = await createSelfService();
    assert.equal((await getFinal(poll.code, "nikdo")).response.status, 403, "před hlasem výsledky nejsou");

    await vote(poll.code, poll.questionId, poll.optionIds[0], "a");
    await vote(poll.code, poll.questionId, poll.optionIds[1], "b");
    await vote(poll.code, poll.questionId, poll.optionIds[1], "c");

    const { response, body, text } = await getFinal(poll.code, "a");
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    const q = body.questions[0];
    assert.deepEqual(
      q.options.map((o: { votes: number }) => o.votes),
      [1, 2, 0]
    );
    assert.equal(q.totalVotes, 3);
    assert.equal(q.participantSelectedOptionId, poll.optionIds[0]);
    assert.equal(q.correctOptionId, null, "během hlasování se správná odpověď neprozradí ani hlasujícímu");
    assert.doesNotMatch(text, /"b"|"c"/, "žádná cizí participant ID");
    const { text: pubText } = await getPublic(poll.code);
    assert.doesNotMatch(pubText, /correctOptionId/);
    assert.equal((await getSharePreview(poll.code))?.options.length, 3);
    assert.doesNotMatch(JSON.stringify(await getSharePreview(poll.code)), /correct|votes/i);

    assert.equal((await endPoll(poll.token)).status, 200);
    assert.equal((await vote(poll.code, poll.questionId, poll.optionIds[2], "d")).response.status, 409, "po ukončení se nehlasuje");
    const { body: final } = await getFinal(poll.code, "zcela-novy");
    assert.equal(final.questions[0].correctOptionId, poll.optionIds[1], "po ukončení vyhodnocení pro všechny");
  });

  test("moderátorské akce živého hlasování nejdou, ukončení ano", async () => {
    const poll = await createSelfService();
    assert.equal((await closeQuestion(poll.token, poll.questionId)).status, 409);
    assert.equal((await activate(poll.token, poll.questionId)).status, 409);
    const { body: mod } = await getModerator(poll.token);
    assert.equal(mod.mode, "self_service");
    assert.equal(mod.questions[0].status, "active");
    assert.equal((await endPoll(poll.token)).status, 200);
    const { body: closed } = await getModerator(poll.token);
    assert.equal(closed.pollStatus, "closed");
    assert.equal(closed.questions[0].status, "ended");
  });

  test("úprava před prvním hlasem ano, po něm ne; vždy jen jedna otázka", async () => {
    const poll = await createSelfService();
    const { body: content } = await getContent(poll.token);
    assert.equal(content.mode, "self_service");
    assert.equal(content.questions[0].locked, false, "aktivní, ale bez hlasů → lze upravit");

    const payload = contentToPayload(content);
    payload.questions[0].text = "Kam pojedeme?";
    payload.questions[0].options[2].text = "Do lesa";
    const saved = await putContent(poll.token, payload);
    assert.equal(saved.response.status, 200, JSON.stringify(saved.body));
    assert.equal((await getPublic(poll.code)).body.activeQuestion.text, "Kam pojedeme?");

    const { body: v2 } = await getContent(poll.token);
    const added = contentToPayload(v2);
    added.questions.push({ text: "Druhá", options: [{ text: "A" }, { text: "B" }], image: null, link: null, correctOptionIndex: null });
    const rejectedAdd = await putContent(poll.token, added);
    assert.equal(rejectedAdd.response.status, 409, "druhou otázku nelze přidat");
    assert.equal(rejectedAdd.body.code, "invalid_change");

    await vote(poll.code, poll.questionId, poll.optionIds[0], "a");
    const { body: v3 } = await getContent(poll.token);
    assert.equal(v3.questions[0].locked, true);
    const changed = contentToPayload(v3);
    changed.questions[0].options[0].text = "Jiný význam";
    const rejectedChange = await putContent(poll.token, changed);
    assert.equal(rejectedChange.response.status, 409, "po prvním hlasu nelze měnit odpovědi");
    assert.equal(rejectedChange.body.code, "invalid_change");
    const sameTitle = contentToPayload(v3);
    sameTitle.title = "Nový název";
    assert.equal((await putContent(poll.token, sameTitle)).response.status, 200, "název jde změnit i po hlasu");
    assert.equal((await endPoll(poll.token)).status, 200, "ukončit jde vždy");
  });

  test("limit hlasů z jedné IP do jedné ankety", async () => {
    const poll = await createSelfService();
    const ip = uniqueIp();
    const limit = RATE_LIMITS.selfServiceVotePerIp.limit;
    for (let i = 0; i < limit; i++) {
      assert.equal((await vote(poll.code, poll.questionId, poll.optionIds[0], `ip-${i}`, ip)).response.status, 200);
    }
    assert.equal((await vote(poll.code, poll.questionId, poll.optionIds[0], "ip-over", ip)).response.status, 429);
    assert.equal((await vote(poll.code, poll.questionId, poll.optionIds[0], "jina-ip", uniqueIp())).response.status, 200);
  });

  test("platnost se prodlouží hlasem (nejvýš jeden zápis za den)", async () => {
    const poll = await createSelfService();
    await testDb.db.update(polls).set({ expiresAt: new Date(Date.now() + 2 * DAY) }).where(eq(polls.publicCode, poll.code));
    await vote(poll.code, poll.questionId, poll.optionIds[0], "a");
    const [row] = await testDb.db.select().from(polls).where(eq(polls.publicCode, poll.code));
    assert.ok(row.expiresAt.getTime() > Date.now() + 29.9 * DAY);
  });

  test("Open Graph metadata: otázka, výzva, obrázek s verzí, kanonická URL, noindex", async () => {
    const poll = await createSelfService();
    const preview = await getSharePreview(poll.code);
    assert.ok(preview);
    const meta = pollPageMetadata(poll.code, preview);
    assert.equal(meta.title, "Kam na výlet?");
    assert.deepEqual(meta.robots, { index: false, follow: false });
    const og = meta.openGraph as Record<string, unknown> & { images: { url: string; width: number; height: number }[] };
    assert.equal(og.type, "website");
    assert.equal(og.title, "Kam na výlet?");
    assert.equal(og.url, `https://hlasuju.cz/${poll.code}`);
    assert.match(String(og.description), /Zahlasujte/);
    assert.equal(og.images[0].url, `https://hlasuju.cz/og/${poll.code}?v=1`);
    assert.equal(og.images[0].width, 1200);
    assert.equal(og.images[0].height, 630);
    assert.doesNotMatch(JSON.stringify(meta), /Moře.*správn|correct/i);
  });
});

describe("e-maily", () => {
  test("po vytvoření: text pro anketu pro web; živé hlasování beze změny", () => {
    const live = buildPollCreatedEmail({ title: "X", publicCode: "123456", moderatorToken: "tok" });
    assert.equal(live.subject, "Vaše hlasování je připravené – Hlasuju.cz");
    assert.match(live.text, /Spouštějte otázky/);
    const web = buildPollCreatedEmail({ title: "X", publicCode: "123456", moderatorToken: "tok", mode: "self_service" });
    assert.equal(web.subject, "Vaše anketa je připravená – Hlasuju.cz");
    assert.match(web.text, /Vložit na web/);
    assert.doesNotMatch(web.text, /Spouštějte otázky/);
  });

  test("výsledky ukončené ankety e-mailem i CSV", async () => {
    const poll = await createSelfService();
    await vote(poll.code, poll.questionId, poll.optionIds[1], "a");
    await endPoll(poll.token);
    const { body: mod } = await getModerator(poll.token);
    const email = buildResultsEmail({
      title: mod.title,
      publicCode: mod.publicCode,
      createdAt: new Date(),
      uniqueParticipants: mod.uniqueParticipants,
      questions: mod.questions,
    });
    assert.match(email.text, /Moře: 100 %/);
    assert.match(String(email.attachments[0].content), /Moře;1;100 %;ano/);
  });
});
