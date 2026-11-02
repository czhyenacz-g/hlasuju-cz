import { after, before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { gifBytes, jpegBytes, pngBytes, routeParams, setupTestDb, uniqueIp, webpVp8xBytes } from "./helpers/db.ts";
import { MOCK_CONTENT_API_TOKEN, startMockContentApi, type MockContentApi } from "./helpers/content-api-mock.ts";
import { activate, contentToPayload, createPoll, endPoll, getContent, getModerator, getPublic, putContent } from "./helpers/polls.ts";
import * as imagesRoute from "../app/api/polls/moderator/[moderatorToken]/images/route.ts";
import { pollImages } from "../db/schema.ts";
import * as duplicateRoute from "../app/api/polls/moderator/[moderatorToken]/duplicate/route.ts";
import { LIMITS } from "../lib/polls/limits.ts";

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
beforeEach(() => api.setMode("ok"));

async function upload(token: string, bytes: Uint8Array, name = "foto.png", type = "image/png") {
  const form = new FormData();
  form.append("file", new File([bytes as Uint8Array<ArrayBuffer>], name, { type }));
  const request = new Request("http://localhost/x", { method: "POST", body: form, headers: { "x-forwarded-for": uniqueIp() } });
  const response = await imagesRoute.POST(request, routeParams({ moderatorToken: token }));
  const text = await response.text();
  assert.equal(text.includes(MOCK_CONTENT_API_TOKEN), false, "token Content API nesmí nikdy odejít klientovi");
  return { response, body: JSON.parse(text) };
}

function uploadRequests() {
  return api.requests.filter((request) => request.method === "POST").length;
}

describe("B — upload obrázků přes Content API", () => {
  test("platný PNG/JPEG/WebP se pošle do Content API (token jen v hlavičce serveru) a zapíše do evidence", async () => {
    const { body: created } = await createPoll();
    for (const [bytes, width, height] of [
      [pngBytes(1200, 800), 1200, 800],
      [jpegBytes(640, 480), 640, 480],
      [webpVp8xBytes(1000, 750), 1000, 750],
    ] as const) {
      const { response, body } = await upload(created.moderatorToken, bytes);
      assert.equal(response.status, 201);
      assert.equal(body.width, width);
      assert.equal(body.height, height);
      assert.match(body.url, new RegExp(`^${api.baseUrl}/media/\\d+$`));
      const [row] = await testDb.db.select().from(pollImages).where(eq(pollImages.url, body.url));
      assert.ok(row, "upload je v evidenci poll_images");
      const stored = api.media.get(row.storageId);
      assert.ok(stored);
      assert.equal(stored.metadata.source, "hlasuju");
      assert.equal(stored.metadata.poll_id, String(row.pollId));
    }
    const last = api.requests.at(-1);
    assert.equal(last?.authorization, `Bearer ${MOCK_CONTENT_API_TOKEN}`);
    assert.equal(last?.path, "/api/v1/projects/hlasuju/media");
  });

  test("rozměry se berou z odpovědi Content API (zmenšení na jeho straně)", async () => {
    const { body: created } = await createPoll();
    const { response, body } = await upload(created.moderatorToken, pngBytes(5120, 2560));
    assert.equal(response.status, 201);
    assert.deepEqual([body.width, body.height], [2560, 1280]);
  });

  test("bez platného moderátorského tokenu se do Content API nic nepošle", async () => {
    const before = uploadRequests();
    const { response } = await upload("neplatny-token-neplatny-token-x", pngBytes(10, 10));
    assert.equal(response.status, 404);
    assert.equal(uploadRequests(), before);
  });

  test("odmítne SVG, text, falešnou příponu i GIF ještě před Content API", async () => {
    const { body: created } = await createPoll();
    const before = uploadRequests();
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    assert.equal((await upload(created.moderatorToken, svg, "x.svg", "image/svg+xml")).response.status, 415);
    assert.equal((await upload(created.moderatorToken, new TextEncoder().encode("hello"), "x.png", "image/png")).response.status, 415);
    assert.equal((await upload(created.moderatorToken, new TextEncoder().encode("%PDF-1.7 fake"), "foto.jpg", "image/jpeg")).response.status, 415);
    assert.equal((await upload(created.moderatorToken, gifBytes(320, 200), "a.gif", "image/gif")).response.status, 415);
    assert.equal((await upload(created.moderatorToken, pngBytes(100, 100).slice(0, 18))).response.status, 415);
    assert.equal(uploadRequests(), before);
  });

  test("příliš velký soubor (413) a obří rozměry (400)", async () => {
    const { body: created } = await createPoll();
    assert.equal((await upload(created.moderatorToken, pngBytes(2000, 2000, LIMITS.MAX_IMAGE_BYTES))).response.status, 413);
    assert.equal((await upload(created.moderatorToken, pngBytes(20000, 100))).response.status, 400);
  });

  test("ukončené hlasování už upload nepřijme", async () => {
    const { body: created } = await createPoll();
    await endPoll(created.moderatorToken);
    assert.equal((await upload(created.moderatorToken, pngBytes(10, 10))).response.status, 409);
  });

  test("bez CONTENT_API_TOKEN → 503 storage_not_configured", async () => {
    const { body: created } = await createPoll();
    const saved = process.env.CONTENT_API_TOKEN;
    delete process.env.CONTENT_API_TOKEN;
    try {
      const { response, body } = await upload(created.moderatorToken, pngBytes(10, 10));
      assert.equal(response.status, 503);
      assert.equal(body.code, "storage_not_configured");
    } finally {
      process.env.CONTENT_API_TOKEN = saved;
    }
  });
});

describe("B — výpadky a limity Content API", () => {
  test("Content API vrací 5xx → 502 storage_unavailable, v evidenci nic", async () => {
    const { body: created } = await createPoll();
    const rowsBefore = (await testDb.db.select().from(pollImages)).length;
    api.setMode("down");
    const { response, body } = await upload(created.moderatorToken, pngBytes(10, 10));
    assert.equal(response.status, 502);
    assert.equal(body.code, "storage_unavailable");
    assert.equal((await testDb.db.select().from(pollImages)).length, rowsBefore);
  });

  test("Content API neodpovídá (spojení odmítnuto) → 502", async () => {
    const { body: created } = await createPoll();
    const saved = process.env.CONTENT_API_URL;
    process.env.CONTENT_API_URL = "http://127.0.0.1:1";
    try {
      const { response, body } = await upload(created.moderatorToken, pngBytes(10, 10));
      assert.equal(response.status, 502);
      assert.equal(body.code, "storage_unavailable");
    } finally {
      process.env.CONTENT_API_URL = saved;
    }
  });

  test("rate limit Content API → 503 storage_busy s Retry-After (editor počká a zkusí znovu)", async () => {
    const { body: created } = await createPoll();
    api.setMode("busy");
    const { response, body } = await upload(created.moderatorToken, pngBytes(10, 10));
    assert.equal(response.status, 503);
    assert.equal(body.code, "storage_busy");
    assert.equal(body.retryAfter, 7);
    assert.equal(response.headers.get("retry-after"), "7");
  });

  test("odmítnutý token Content API → 502, token ani detail se klientovi neukáže", async () => {
    const { body: created } = await createPoll();
    api.setMode("unauthorized");
    const { response, body } = await upload(created.moderatorToken, pngBytes(10, 10));
    assert.equal(response.status, 502);
    assert.doesNotMatch(body.error, /token|401|Bearer/i);
  });

  test("neveřejné médium (špatně nastavený projekt) se odmítne a hned smaže", async () => {
    const { body: created } = await createPoll();
    api.setMode("private");
    const { response } = await upload(created.moderatorToken, pngBytes(10, 10));
    assert.equal(response.status, 502);
    api.setMode("ok");
    const lastUpload = [...api.media.values()].at(-1);
    assert.equal(lastUpload?.deleted, true);
  });

  test("výpadek Content API neovlivní hlasování — spuštění, stav i hlasy fungují dál", async () => {
    const { body: created } = await createPoll();
    const { body: content } = await getContent(created.moderatorToken);
    const { body: image } = await upload(created.moderatorToken, pngBytes(800, 600));
    const payload = contentToPayload(content);
    payload.questions[0].image = { url: image.url, width: 800, height: 600, alt: null };
    assert.equal((await putContent(created.moderatorToken, payload)).response.status, 200);

    api.setMode("down");
    assert.equal((await activate(created.moderatorToken, content.questions[0].id)).status, 200);
    const { response, body } = await getPublic(created.publicCode);
    assert.equal(response.status, 200);
    assert.equal(body.activeQuestion.image.url, image.url);
  });
});

describe("B — celý workflow obrázku: uložit, zobrazit, nahradit, odstranit", () => {
  test("editor uloží obrázek, účastník ho vidí, náhrada i odstranění smažou soubor v Content API", async () => {
    const { body: created } = await createPoll();
    const { body: content } = await getContent(created.moderatorToken);
    const questionId = content.questions[0].id;

    // Uložení (rozměry se vezmou z evidence, ne od klienta).
    const { body: first } = await upload(created.moderatorToken, pngBytes(1200, 800));
    const withImage = contentToPayload(content);
    withImage.questions[0].image = { url: first.url, width: 1, height: 1, alt: "Fotografie zranění" };
    const saved = await putContent(created.moderatorToken, withImage);
    assert.equal(saved.response.status, 200);
    assert.deepEqual(saved.body.questions[0].image, { url: first.url, width: 1200, height: 800, alt: "Fotografie zranění" });

    // Moderátor ho vidí v konzoli, účastník až po spuštění otázky.
    const moderator = await getModerator(created.moderatorToken);
    assert.equal(moderator.body.questions[0].image.url, first.url);
    assert.equal((await getPublic(created.publicCode)).body.activeQuestion, null);

    // Náhrada → starý soubor se smaže v Content API.
    const { body: second } = await upload(created.moderatorToken, jpegBytes(640, 480));
    const replaced = contentToPayload(saved.body);
    replaced.questions[0].image = { url: second.url, width: 640, height: 480, alt: null };
    const afterReplace = await putContent(created.moderatorToken, replaced);
    assert.equal(afterReplace.response.status, 200);
    const firstRow = (await testDb.db.select().from(pollImages).where(eq(pollImages.url, first.url)))[0];
    assert.ok(firstRow.deletedAt, "nahrazený obrázek je v evidenci označený jako smazaný");
    assert.equal(api.media.get(firstRow.storageId)?.deleted, true);

    // Účastník vidí obrázek aktivní otázky.
    await activate(created.moderatorToken, questionId);
    const publicView = await getPublic(created.publicCode);
    assert.equal(publicView.body.activeQuestion.image.url, second.url);
    const served = await fetch(second.url);
    assert.equal(served.status, 200);
    assert.match(served.headers.get("cache-control") ?? "", /immutable/);

    // Spuštěnou otázku už měnit nejde, ale u nové otázky jde obrázek odebrat.
    const { body: current } = await getContent(created.moderatorToken);
    const removable = contentToPayload(current);
    const { body: third } = await upload(created.moderatorToken, pngBytes(300, 200));
    removable.questions[1].image = { url: third.url, width: 300, height: 200, alt: null };
    const withThird = await putContent(created.moderatorToken, removable);
    assert.equal(withThird.response.status, 200);
    const removed = contentToPayload(withThird.body);
    removed.questions[1].image = null;
    assert.equal((await putContent(created.moderatorToken, removed)).response.status, 200);
    const thirdRow = (await testDb.db.select().from(pollImages).where(eq(pollImages.url, third.url)))[0];
    assert.ok(thirdRow.deletedAt);
    assert.equal(api.media.get(thirdRow.storageId)?.deleted, true);
  });

  test("k otázce nejde uložit cizí URL ani obrázek jiného hlasování", async () => {
    const { body: a } = await createPoll();
    const { body: b } = await createPoll();
    const { body: imageOfB } = await upload(b.moderatorToken, pngBytes(10, 10));
    const { body: content } = await getContent(a.moderatorToken);

    for (const url of ["https://evil.example.com/pixel.png", imageOfB.url, `${api.baseUrl}/media/999999`]) {
      const payload = contentToPayload(content);
      payload.questions[0].image = { url, width: 10, height: 10, alt: null };
      assert.equal((await putContent(a.moderatorToken, payload)).response.status, 409, url);
    }
  });

  test("obrázek sdílený duplikovanou otázkou se nesmaže, dokud ho něco používá", async () => {
    const { body: created } = await createPoll();
    const { body: content } = await getContent(created.moderatorToken);
    const { body: image } = await upload(created.moderatorToken, pngBytes(50, 50));
    const payload = contentToPayload(content);
    payload.questions[0].image = { url: image.url, width: 50, height: 50, alt: null };
    payload.questions[1].image = { url: image.url, width: 50, height: 50, alt: null };
    const saved = await putContent(created.moderatorToken, payload);
    assert.equal(saved.response.status, 200);

    const oneRemoved = contentToPayload(saved.body);
    oneRemoved.questions[0].image = null;
    assert.equal((await putContent(created.moderatorToken, oneRemoved)).response.status, 200);
    const [row] = await testDb.db.select().from(pollImages).where(eq(pollImages.url, image.url));
    assert.equal(row.deletedAt, null);
    assert.equal(api.media.get(row.storageId)?.deleted, false);
  });

  test("když mazání v Content API selže, uložení stejně projde a soubor zůstane v evidenci pro cron", async () => {
    const { body: created } = await createPoll();
    const { body: content } = await getContent(created.moderatorToken);
    const { body: image } = await upload(created.moderatorToken, pngBytes(50, 50));
    const payload = contentToPayload(content);
    payload.questions[0].image = { url: image.url, width: 50, height: 50, alt: null };
    const saved = await putContent(created.moderatorToken, payload);

    api.setMode("down");
    const removed = contentToPayload(saved.body);
    removed.questions[0].image = null;
    assert.equal((await putContent(created.moderatorToken, removed)).response.status, 200);
    const [row] = await testDb.db.select().from(pollImages).where(eq(pollImages.url, image.url));
    assert.equal(row.deletedAt, null, "nesmazaný soubor zůstává v evidenci, dočistí ho cron");
  });
});

describe("pozadí prezentace", () => {
  test("uloží jen vlastní obrázek, moderátor ho vidí, účastník ne; beze změny zůstane, odebrání smaže soubor", async () => {
    const { body: created } = await createPoll();
    const token = created.moderatorToken;
    const { body: content } = await getContent(token);
    assert.equal(content.backgroundImage, null);

    // Cizí URL nejde.
    const foreign = { ...contentToPayload(content), backgroundImage: { url: "https://evil.example.com/bg.jpg", width: 10, height: 10 } };
    assert.equal((await putContent(token, foreign)).response.status, 409);

    // Vlastní upload (rozměry z evidence, ne od klienta).
    const { body: image } = await upload(token, pngBytes(1600, 900));
    const saved = await putContent(token, { ...contentToPayload(content), backgroundImage: { url: image.url, width: 1, height: 1 } });
    assert.equal(saved.response.status, 200, JSON.stringify(saved.body));
    assert.deepEqual(saved.body.backgroundImage, { url: image.url, width: 1600, height: 900 });
    assert.deepEqual((await getModerator(token)).body.backgroundImage, { url: image.url, width: 1600, height: 900 });
    assert.ok(!(await getPublic(created.publicCode)).text.includes(image.url), "účastník pozadí nedostává");

    // Klient bez pole backgroundImage (starší editor) pozadí nezmění.
    const unchanged = await putContent(token, contentToPayload(saved.body));
    assert.equal(unchanged.response.status, 200);
    assert.equal(unchanged.body.backgroundImage.url, image.url);

    // Stejný obrázek i u otázky: odebrání pozadí soubor nesmaže, dokud ho otázka používá.
    const both = contentToPayload(unchanged.body);
    both.questions[0].image = { url: image.url, width: 1600, height: 900, alt: null };
    const withQuestion = await putContent(token, { ...both, backgroundImage: { url: image.url, width: 1600, height: 900 } });
    assert.equal(withQuestion.response.status, 200);
    const noBackground = await putContent(token, { ...contentToPayload(withQuestion.body), backgroundImage: null });
    assert.equal(noBackground.body.backgroundImage, null);
    let [row] = await testDb.db.select().from(pollImages).where(eq(pollImages.url, image.url));
    assert.equal(row.deletedAt, null);

    // Teď už ho nic nepoužívá → smaže se.
    const cleared = contentToPayload(noBackground.body);
    cleared.questions[0].image = null;
    assert.equal((await putContent(token, { ...cleared, backgroundImage: null })).response.status, 200);
    [row] = await testDb.db.select().from(pollImages).where(eq(pollImages.url, image.url));
    assert.ok(row.deletedAt);
    assert.equal(api.media.get(row.storageId)?.deleted, true);
  });

  test("nové promítání převezme pozadí; odebrání v kopii nesmaže soubor originálu", async () => {
    const { body: created } = await createPoll();
    const token = created.moderatorToken;
    const { body: image } = await upload(token, pngBytes(800, 600));
    const { body: content } = await getContent(token);
    assert.equal((await putContent(token, { ...contentToPayload(content), backgroundImage: { url: image.url, width: 800, height: 600 } })).response.status, 200);

    const response = await duplicateRoute.POST(new Request("http://localhost/x", { method: "POST", headers: { "x-forwarded-for": uniqueIp() } }) as never, routeParams({ moderatorToken: token }));
    assert.equal(response.status, 201);
    const copy = await response.json();
    assert.equal((await getModerator(copy.moderatorToken)).body.backgroundImage.url, image.url);

    const { body: copyContent } = await getContent(copy.moderatorToken);
    assert.equal((await putContent(copy.moderatorToken, { ...contentToPayload(copyContent), backgroundImage: null })).response.status, 200);
    const [row] = await testDb.db.select().from(pollImages).where(eq(pollImages.url, image.url));
    assert.equal(row.deletedAt, null, "originál pozadí dál používá");
    assert.equal((await getModerator(token)).body.backgroundImage.url, image.url);
  });

  test("neplatné pozadí → 400", async () => {
    const { body: created } = await createPoll();
    const { body: content } = await getContent(created.moderatorToken);
    const bad = await putContent(created.moderatorToken, { ...contentToPayload(content), backgroundImage: { url: "javascript:alert(1)", width: 10, height: 10 } });
    assert.equal(bad.response.status, 400);
  });
});
