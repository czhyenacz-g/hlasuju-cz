import { after, before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { routeParams, setupTestDb, jsonRequest } from "./helpers/db.ts";
import { activate, closeQuestion, createPoll, endPoll, getModerator, getPublic, SAMPLE_QUESTIONS, vote } from "./helpers/polls.ts";
import * as resultsEmailRoute from "../app/api/polls/moderator/[moderatorToken]/results-email/route.ts";
import { polls } from "../db/schema.ts";
import { buildPollCreatedEmail, POLL_CREATED_SUBJECT } from "../lib/email/send-poll-created-email.ts";
import { buildResultsCsv, buildResultsEmail, percent } from "../lib/email/send-results-email.ts";
import { maskEmail, RESULTS_EMAIL_INTERVAL_MS, RESULTS_EMAIL_MAX_SENDS, sendResultsEmail } from "../lib/polls/send-results-email.ts";

// Resend SDK volá globální fetch na https://api.resend.com — zachytí se
// tady, žádný e-mail neodchází ven.
type SentEmail = { from: string; to: string; subject: string; html: string; text: string; attachments?: { filename: string; content: unknown }[] };
const sent: SentEmail[] = [];
let resendMode: "ok" | "error" | "throw" = "ok";
const realFetch = globalThis.fetch;

let testDb: Awaited<ReturnType<typeof setupTestDb>>;
const ENV_KEYS = ["RESEND_API_KEY", "RESEND_FROM_EMAIL"] as const;
const savedEnv: Record<string, string | undefined> = {};

before(async () => {
  testDb = await setupTestDb();
  for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (!url.startsWith("https://api.resend.com/")) return realFetch(input, init);
    if (resendMode === "throw") throw new TypeError("fetch failed");
    if (resendMode === "error") {
      return new Response(JSON.stringify({ name: "validation_error", message: "Domain not verified", statusCode: 403 }), {
        status: 403,
        headers: { "content-type": "application/json" },
      });
    }
    sent.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({ id: `email-${sent.length}` }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
});
after(async () => {
  globalThis.fetch = realFetch;
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  await testDb.close();
});
beforeEach(() => {
  sent.length = 0;
  resendMode = "ok";
  process.env.RESEND_API_KEY = "re_test_key";
  process.env.RESEND_FROM_EMAIL = "Hlasuju.cz <hlasovani@example.test>";
});

/** E-mail po vytvoření jde přes after() — v testu běží na pozadí, chvíli počkat. */
async function waitForSent(count: number) {
  for (let i = 0; i < 50 && sent.length < count; i++) await new Promise((resolve) => setTimeout(resolve, 10));
}

async function closedPollWithVotes(email: string | null = "moderator@example.test") {
  const { body } = await createPoll({ title: "Kurz první pomoci", email: email ?? undefined, questions: SAMPLE_QUESTIONS });
  const token: string = body.moderatorToken;
  const [q1, q2] = body.questionIds as number[];
  const { body: mod } = await getModerator(token);
  const options1 = mod.questions[0].options.map((o: { id: number }) => o.id);
  const options2 = mod.questions[1].options.map((o: { id: number }) => o.id);
  await activate(token, q1);
  await vote(body.publicCode, q1, options1[0], "p1");
  await vote(body.publicCode, q1, options1[0], "p2");
  await vote(body.publicCode, q1, options1[1], "p3");
  await closeQuestion(token, q1);
  await activate(token, q2);
  await vote(body.publicCode, q2, options2[1], "p1");
  await endPoll(token);
  sent.length = 0;
  return { token, publicCode: body.publicCode as string };
}

function sendViaRoute(token: string) {
  return resultsEmailRoute.POST(jsonRequest("/x", "POST"), routeParams({ moderatorToken: token }));
}

describe("e-mail po vytvoření hlasování", () => {
  test("obsahuje název, kód, oba odkazy a návod; HTML i text", async () => {
    const { body } = await createPoll({ title: "Kurz <první> pomoci", email: "moderator@example.test", questions: SAMPLE_QUESTIONS });
    await waitForSent(1);
    assert.equal(sent.length, 1);
    const [email] = sent;
    assert.equal(email.to, "moderator@example.test");
    assert.equal(email.subject, "Vaše hlasování je připravené – Hlasuju.cz");
    assert.equal(email.from, "Hlasuju.cz <hlasovani@example.test>");
    for (const content of [email.html, email.text]) {
      assert.match(content, new RegExp(`https://hlasuju.cz/${body.publicCode}`));
      assert.match(content, new RegExp(`https://hlasuju.cz/m/${body.moderatorToken}`));
      assert.match(content, new RegExp(`${body.publicCode.slice(0, 3)} ${body.publicCode.slice(3)}`));
      assert.match(content, /Jak na to/);
    }
    assert.match(email.text, /Kurz <první> pomoci/);
    assert.match(email.html, /Kurz &lt;první&gt; pomoci/, "název musí být v HTML escapovaný");
    assert.doesNotMatch(email.html, /<první>/);
  });

  test("bez e-mailu se nic neposílá", async () => {
    await createPoll({ title: "Bez mailu", questions: SAMPLE_QUESTIONS });
    await waitForSent(1);
    assert.equal(sent.length, 0);
  });

  test("bez RESEND_API_KEY vytvoření projde a nic se neposílá", async () => {
    delete process.env.RESEND_API_KEY;
    const { response } = await createPoll({ title: "x", email: "moderator@example.test", questions: SAMPLE_QUESTIONS });
    assert.equal(response.status, 201);
    await waitForSent(1);
    assert.equal(sent.length, 0);
  });

  for (const mode of ["error", "throw"] as const) {
    test(`selhání Resendu (${mode}) nerozbije vytvoření ani hlasování a neloguje odkaz`, async () => {
      resendMode = mode;
      const logged: string[] = [];
      const originalError = console.error;
      console.error = (...args: unknown[]) => logged.push(args.map(String).join(" "));
      try {
        const { response, body } = await createPoll({ title: "x", email: "moderator@example.test", questions: SAMPLE_QUESTIONS });
        assert.equal(response.status, 201);
        await new Promise((resolve) => setTimeout(resolve, 50));
        const { response: publicResponse } = await getPublic(body.publicCode);
        assert.equal(publicResponse.status, 200);
        assert.ok(logged.length >= 1, "chyba se má zalogovat");
        for (const line of logged) {
          assert.equal(line.includes(body.moderatorToken), false, "moderátorský token nesmí do logu");
          assert.equal(line.includes("moderator@example.test"), false, "adresa nesmí do logu");
        }
      } finally {
        console.error = originalError;
      }
    });
  }

  test("buildPollCreatedEmail bez názvu", () => {
    const email = buildPollCreatedEmail({ title: null, publicCode: "123456", moderatorToken: "t".repeat(43) });
    assert.equal(email.subject, POLL_CREATED_SUBJECT);
    assert.match(email.text, /^Vaše hlasování je připravené\./);
  });
});

describe("e-mail s výsledky", () => {
  test("procenta a CSV", () => {
    assert.equal(percent(2, 3), 67);
    assert.equal(percent(1, 3), 33);
    assert.equal(percent(0, 0), 0);
    const csv = buildResultsCsv({
      title: "t",
      publicCode: "123456",
      createdAt: new Date(),
      uniqueParticipants: 3,
      questions: [{ text: "Ano; nebo \"ne\"?", totalVotes: 3, options: [{ text: "=SUM(A1)", votes: 2 }, { text: "Ne", votes: 1 }] }],
    });
    assert.ok(csv.startsWith("﻿Otázka;Odpověď;Hlasy;Procenta\r\n"));
    assert.match(csv, /"1\. Ano; nebo ""ne""\?";'=SUM\(A1\);2;67 %/);
    assert.match(csv, /;Ne;1;33 %/);
  });

  test("moderátor pošle výsledky: počty, procenta, účastníci, CSV, jen spuštěné otázky", async () => {
    const { token, publicCode } = await closedPollWithVotes();
    const response = await sendViaRoute(token);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.remaining, RESULTS_EMAIL_MAX_SENDS - 1);
    assert.equal(sent.length, 1);
    const [email] = sent;
    assert.equal(email.to, "moderator@example.test");
    assert.equal(email.subject, "Výsledky: Kurz první pomoci – Hlasuju.cz");
    assert.match(email.text, /účastníků: 3/);
    assert.match(email.text, /Odřenina: 67 % \(2 hlasy\)/);
    assert.match(email.text, /Řezná rána: 33 % \(1 hlas\)/);
    assert.match(email.text, /Popálenina: 0 % \(0 hlasů\)/);
    assert.match(email.text, /TAJNÁ ODPOVĚĎ B: 100 % \(1 hlas\)/);
    assert.doesNotMatch(email.text, /TAJNÁ TŘETÍ OTÁZKA/, "nespuštěná otázka do výsledků nepatří");
    assert.match(email.html, new RegExp(`https://hlasuju.cz/${publicCode}`));
    assert.doesNotMatch(email.html + email.text, new RegExp(token), "moderátorský odkaz v e-mailu s výsledky není potřeba");
    assert.equal(email.attachments?.[0]?.filename, `vysledky-${publicCode}.csv`);
  });

  test("bez platného tokenu nic neodejde", async () => {
    const response = await sendViaRoute("x".repeat(43));
    assert.equal(response.status, 404);
    assert.equal(sent.length, 0);
  });

  test("před ukončením hlasování nelze poslat", async () => {
    const { body } = await createPoll({ title: "x", email: "moderator@example.test", questions: SAMPLE_QUESTIONS });
    await waitForSent(1);
    sent.length = 0;
    const response = await sendViaRoute(body.moderatorToken);
    assert.equal(response.status, 409);
    assert.equal(sent.length, 0);
  });

  test("bez uloženého e-mailu nelze poslat a moderátor to vidí", async () => {
    const { token } = await closedPollWithVotes(null);
    const { body: mod } = await getModerator(token);
    assert.equal(mod.resultsEmail.to, null);
    const response = await sendViaRoute(token);
    assert.equal(response.status, 409);
    assert.equal(sent.length, 0);
  });

  test("příjemce nejde podvrhnout tělem požadavku", async () => {
    const { token } = await closedPollWithVotes();
    const response = await resultsEmailRoute.POST(
      jsonRequest("/x", "POST", { to: "utocnik@example.test", email: "utocnik@example.test" }),
      routeParams({ moderatorToken: token })
    );
    assert.equal(response.status, 200);
    assert.equal(sent[0].to, "moderator@example.test");
  });

  test("ochrana proti opakovanému odeslání: interval i celkový limit, i souběžně", async () => {
    const { token } = await closedPollWithVotes();
    const results = await Promise.all([sendViaRoute(token), sendViaRoute(token), sendViaRoute(token)]);
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 429, 429]);
    assert.ok(Number(results.find((r) => r.status === 429)!.headers.get("retry-after")) > 0);
    assert.equal(sent.length, 1);

    let now = Date.now();
    for (let i = 1; i < RESULTS_EMAIL_MAX_SENDS; i++) {
      now += RESULTS_EMAIL_INTERVAL_MS + 1000;
      assert.equal((await sendResultsEmail(token, new Date(now))).ok, true);
    }
    now += RESULTS_EMAIL_INTERVAL_MS + 1000;
    assert.deepEqual(await sendResultsEmail(token, new Date(now)), { ok: false, reason: "limit_reached" });
    assert.equal(sent.length, RESULTS_EMAIL_MAX_SENDS);
  });

  test("selhání Resendu: chyba pro moderátora, pokus se nezapočítá", async () => {
    const { token } = await closedPollWithVotes();
    resendMode = "error";
    const originalError = console.error;
    console.error = () => {};
    try {
      const response = await sendViaRoute(token);
      assert.equal(response.status, 502);
    } finally {
      console.error = originalError;
    }
    const [row] = await testDb.db.select({ count: polls.resultsEmailCount, sentAt: polls.resultsEmailSentAt }).from(polls).where(eq(polls.moderatorToken, token));
    assert.equal(row.count, 0);
    assert.equal(row.sentAt, null);
    resendMode = "ok";
    assert.equal((await sendViaRoute(token)).status, 200, "hned po selhání jde zkusit znovu");
  });

  test("bez RESEND_API_KEY: 503 a moderátor vidí, že odesílání nejde", async () => {
    const { token } = await closedPollWithVotes();
    delete process.env.RESEND_API_KEY;
    const { body: mod } = await getModerator(token);
    assert.equal(mod.resultsEmail.configured, false);
    assert.equal((await sendViaRoute(token)).status, 503);
  });

  test("moderátorský pohled ukazuje jen maskovanou adresu, veřejné API žádnou", async () => {
    const { token, publicCode } = await closedPollWithVotes("jan.novak@example.test");
    const { body: mod } = await getModerator(token);
    assert.equal(mod.resultsEmail.to, "ja•••@example.test");
    assert.equal(JSON.stringify(mod).includes("jan.novak"), false);
    const { text } = await getPublic(publicCode);
    assert.equal(text.includes("example.test"), false);
    assert.equal(maskEmail("a@b.cz"), "a•••@b.cz");
  });

  test("buildResultsEmail escapuje text otázek a odpovědí", () => {
    const email = buildResultsEmail({
      title: "<b>x</b>",
      publicCode: "123456",
      createdAt: new Date("2026-10-24T10:00:00Z"),
      uniqueParticipants: 1,
      questions: [{ text: "<script>", totalVotes: 1, options: [{ text: "<img>", votes: 1 }] }],
    });
    assert.doesNotMatch(email.html, /<script>|<img>|<b>x/);
    assert.match(email.text, /24\. 10\. 2026/);
  });
});
