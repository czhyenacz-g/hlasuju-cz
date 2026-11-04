import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { jsonRequest, routeParams, setupTestDb } from "./helpers/db.ts";
import * as navigateRoute from "../app/api/polls/moderator/[moderatorToken]/navigate/route.ts";
import * as duplicateRoute from "../app/api/polls/moderator/[moderatorToken]/duplicate/route.ts";
import * as resetRoute from "../app/api/polls/moderator/[moderatorToken]/reset/route.ts";
import * as participantRoute from "../app/api/polls/public/[publicCode]/participant/route.ts";
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
import { computeLeaderboard } from "../lib/polls/leaderboard.ts";
import { buildResultsCsv, buildResultsEmail } from "../lib/email/send-results-email.ts";
import { getModeratorPoll } from "../lib/polls/get-moderator-poll.ts";

let testDb: Awaited<ReturnType<typeof setupTestDb>>;
before(async () => {
  testDb = await setupTestDb();
});
after(async () => {
  await testDb.close();
});

/** Testovací prezentace ze zadání (10 slajdů). */
const DECK = [
  { kind: "content", text: "Vítejte", body: "Dnes si zahrajeme.\n\nPřipojte se kódem." },
  { text: "Jak se máte?", options: [{ text: "Dobře" }, { text: "Špatně" }] },
  { kind: "results", resultsQuestionIndex: 1 },
  { kind: "content", text: "Obrázek", body: "Popis k obrázku" },
  { text: "2 + 2 = ?", options: [{ text: "3" }, { text: "4" }], correctOptionIndex: 1, points: 2 },
  { kind: "results", resultsQuestionIndex: 4 },
  { kind: "leaderboard", text: "Průběžné pořadí" },
  { text: "Hlavní město ČR?", options: [{ text: "Praha" }, { text: "Brno" }, { text: "Ostrava" }], correctOptionIndex: 0 },
  { kind: "leaderboard", text: "Konečné výsledky" },
  { kind: "content", text: "Děkujeme", body: "- bod jedna\n- bod dva" },
];

async function navigate(token: string, fromSlideId: number | null, toSlideId: number) {
  const response = await navigateRoute.POST(jsonRequest("/x", "POST", { fromSlideId, toSlideId }), routeParams({ moderatorToken: token }));
  return { response, body: await response.json() };
}

async function participantState(code: string, participantId: string) {
  const response = await participantRoute.GET(jsonRequest(`/x?participantId=${participantId}`, "GET"), routeParams({ publicCode: code }));
  return { response, body: await response.json() };
}

async function register(code: string, participantId: string, name: string) {
  const response = await participantRoute.POST(jsonRequest("/x", "POST", { participantId, name }), routeParams({ publicCode: code }));
  assert.equal(response.status, 200);
}

async function createDeck(extra: Record<string, unknown> = {}) {
  const { response, body } = await createPoll({ title: "Prezentace", questions: DECK, ...extra });
  assert.equal(response.status, 201, JSON.stringify(body));
  const { body: mod } = await getModerator(body.moderatorToken);
  return { token: body.moderatorToken as string, code: body.publicCode as string, slides: mod.questions as ModSlide[] };
}

type ModSlide = {
  id: number;
  kind: string;
  status: string;
  text: string;
  resultsQuestionId: number | null;
  points: number;
  totalVotes: number;
  options: { id: number; text: string; votes: number }[];
  correctOptionId: number | null;
  leaderboard: { entries: { rank: number; tied: boolean; label: string; points: number }[]; scoredQuestions: number; scoredQuestionsTotal: number } | null;
};

async function slidesOf(token: string): Promise<ModSlide[]> {
  return (await getModerator(token)).body.questions;
}

/** Projde prezentaci tlačítkem „Další“ (kontroluje odpověď serveru). */
async function next(token: string, from: ModSlide | null, to: ModSlide) {
  const { response, body } = await navigate(token, from?.id ?? null, to.id);
  assert.equal(response.status, 200, JSON.stringify(body));
}

describe("slajdy — validace", () => {
  test("typy slajdů, vazba výsledků jen na dřívější otázku, body 1–100", () => {
    assert.equal(validateCreatePollInput({ questions: DECK }).ok, true);
    const bad = (questions: unknown[]) => validateCreatePollInput({ questions });
    const q = { text: "Q", options: [{ text: "A" }, { text: "B" }] };
    assert.equal(bad([{ kind: "nesmysl", text: "x" }]).ok, false);
    assert.equal(bad([{ kind: "results", resultsQuestionIndex: 1 }, q]).ok, false, "výsledky před otázkou");
    assert.equal(bad([{ kind: "content", text: "x" }, { kind: "results", resultsQuestionIndex: 0 }]).ok, false, "výsledky obsahového slajdu");
    assert.equal(bad([q, { kind: "results", resultsQuestionIndex: 0 }]).ok, true);
    assert.equal(bad([q, { kind: "results", resultsQuestionIndex: null }]).ok, true, "bez vazby = označená chybějící vazba");
    assert.equal(bad([{ kind: "content", text: "x", options: [{ text: "A" }] }]).ok, false, "obsah nemá odpovědi");
    assert.equal(bad([{ kind: "leaderboard", text: "x", body: "text" }]).ok, false, "žebříček nemá text");
    assert.equal(bad([{ ...q, points: 0 }]).ok, false);
    assert.equal(bad([{ ...q, points: 101 }]).ok, false);
    assert.equal(bad([{ ...q, points: 1.5 }]).ok, false);
    assert.equal(bad([{ kind: "content", text: "x", body: "y".repeat(1501) }]).ok, false);
    // Prázdný obsahový slajd: při vytvoření projde (obrázek se nahraje hned potom), při uložení ne.
    assert.equal(bad([{ kind: "content", text: "" }]).ok, true);
    assert.equal(validateUpdatePollInput({ version: 1, questions: [{ kind: "content", text: "", image: null }] }).ok, false);
    // Veřejná anketa jen s jednou otázkou.
    assert.equal(validateCreatePollInput({ mode: "self_service", questions: [{ kind: "content", text: "x" }] }).ok, false);
  });

  test("starý formát (bez typu) = otázka, body výchozí 1", () => {
    const result = validateCreatePollInput({ questions: [{ text: "Q", options: [{ text: "A" }, { text: "B" }] }] });
    assert.ok(result.ok);
    assert.equal(result.value.questions[0].kind, "question");
    assert.equal(result.value.questions[0].points, 1);
  });
});

describe("žebříček — výpočet", () => {
  const slides = [
    { id: 1, kind: "question" as const, position: 0, status: "ended" as const, correctOptionId: 11, points: 1 },
    { id: 2, kind: "question" as const, position: 1, status: "ended" as const, correctOptionId: null, points: 1 },
    { id: 3, kind: "question" as const, position: 2, status: "ended" as const, correctOptionId: 31, points: 3 },
    { id: 9, kind: "leaderboard" as const, position: 3, status: "prepared" as const, correctOptionId: null, points: 1 },
    { id: 4, kind: "question" as const, position: 4, status: "ended" as const, correctOptionId: 41, points: 5 },
  ];
  const votes = [
    { participantId: "a", questionId: 1, optionId: 11 },
    { participantId: "a", questionId: 3, optionId: 32 },
    { participantId: "b", questionId: 1, optionId: 12 },
    { participantId: "b", questionId: 3, optionId: 31 },
    { participantId: "c", questionId: 3, optionId: 31 },
    { participantId: "d", questionId: 2, optionId: 21 },
    // Pozdější otázka (za žebříčkem) se nesmí započítat.
    { participantId: "a", questionId: 4, optionId: 41 },
  ];

  test("body jen za správné odpovědi uzavřených otázek před slajdem, shodné umístění", () => {
    const view = computeLeaderboard(slides, 3, votes, (id) => id.toUpperCase());
    assert.deepEqual(
      view.entries.map((e) => [e.rank, e.tied, e.label, e.points]),
      [
        [1, true, "B", 3],
        [1, true, "C", 3],
        [3, false, "A", 1],
        [4, false, "D", 0],
      ]
    );
    assert.equal(view.scoredQuestions, 2);
    assert.equal(view.maxPoints, 4);
  });

  test("otevřená/neodehraná otázka se nepočítá; bez bodovaných otázek všichni 0", () => {
    const open = slides.map((slide) => (slide.id === 3 ? { ...slide, status: "active" as const } : slide));
    const view = computeLeaderboard(open, 3, votes, (id) => id);
    assert.equal(view.scoredQuestions, 1);
    assert.equal(view.scoredQuestionsTotal, 2);
    assert.deepEqual(view.entries.find((e) => e.label === "b")?.points, 0);
    const none = computeLeaderboard(
      slides.map((slide) => ({ ...slide, correctOptionId: null })),
      3,
      votes,
      (id) => id
    );
    assert.equal(none.scoredQuestionsTotal, 0);
    assert.ok(none.entries.every((e) => e.points === 0 && e.rank === 1));
  });

  test("bonus za rychlost: první tři SPRÁVNÉ odpovědi +3/+2/+1 podle pořadí zápisu", () => {
    const bonusSlides = [
      { id: 1, kind: "question" as const, position: 0, status: "ended" as const, correctOptionId: 11, points: 2, speedBonus: true },
      { id: 2, kind: "question" as const, position: 1, status: "ended" as const, correctOptionId: 21, points: 1, speedBonus: false },
      { id: 9, kind: "leaderboard" as const, position: 2, status: "prepared" as const, correctOptionId: null, points: 1, speedBonus: false },
    ];
    // Pořadí = pořadí zápisu na serveru; špatná odpověď pořadí „nespotřebuje“.
    const ordered = [
      { participantId: "wrong", questionId: 1, optionId: 12 },
      { participantId: "first", questionId: 1, optionId: 11 },
      { participantId: "second", questionId: 1, optionId: 11 },
      { participantId: "third", questionId: 1, optionId: 11 },
      { participantId: "fourth", questionId: 1, optionId: 11 },
      // Otázka bez bonusu: pořadí nehraje roli.
      { participantId: "fourth", questionId: 2, optionId: 21 },
      { participantId: "first", questionId: 2, optionId: 22 },
    ];
    const view = computeLeaderboard(bonusSlides, 2, ordered, (id) => id);
    assert.deepEqual(
      view.entries.map((e) => [e.rank, e.label, e.points]),
      [
        [1, "first", 5],
        [2, "second", 4],
        [3, "fourth", 3],
        [3, "third", 3],
        [5, "wrong", 0],
      ]
    );
    // Max = 2 + 3 (bonus pro nejrychlejšího) + 1.
    assert.equal(view.maxPoints, 6);
  });
});

describe("prezentace — průchod tlačítkem Další", () => {
  test("celý průchod se dvěma účastníky: automatické otevření/uzavření, výsledky, body, shoda, návrat", async () => {
    const { token, code, slides } = await createDeck({ requireParticipantName: true });
    assert.deepEqual(
      slides.map((s) => s.kind),
      ["content", "question", "results", "content", "question", "results", "leaderboard", "question", "leaderboard", "content"]
    );
    const [intro, q1, r1, , q2, r2, board1, q3, board2, outro] = slides;
    assert.equal(r1.resultsQuestionId, q1.id);
    assert.equal(r2.resultsQuestionId, q2.id);
    assert.equal(q2.points, 2);
    await register(code, "anna", "Anna");
    await register(code, "bert", "Bert");
    await register(code, "cyril", "Cyril");

    // 1) Úvod — účastníci čekají, nic se nehlasuje.
    await next(token, null, intro);
    let pub = (await getPublic(code)).body;
    assert.deepEqual(pub.slide, { kind: "content" });
    assert.equal(pub.activeQuestion, null);
    assert.ok(!JSON.stringify(pub).includes("Dnes si zahrajeme"), "obsah slajdu se účastníkům neposílá");

    // 2) Otázka se při prvním vstupu sama otevře.
    await next(token, intro, q1);
    pub = (await getPublic(code)).body;
    assert.equal(pub.activeQuestion?.id, q1.id);
    assert.equal(pub.slide, null);
    assert.equal((await vote(code, q1.id, q1.options[0].id, "anna")).response.status, 200);
    assert.equal((await vote(code, q1.id, q1.options[1].id, "bert")).response.status, 200);

    // 3) „Další“ uzavře otázku a ukáže výsledky; opožděná odpověď neprojde.
    await next(token, q1, r1);
    assert.equal((await vote(code, q1.id, q1.options[0].id, "cyril")).response.status, 409);
    let state = await slidesOf(token);
    assert.equal(state[1].status, "ended");
    assert.equal(state[1].totalVotes, 2);
    pub = (await getPublic(code)).body;
    assert.deepEqual(pub.slide, { kind: "results" });
    assert.equal(pub.closedQuestion?.id, q1.id, "účastník vidí vyhodnocení otázky z výsledkového slajdu");

    // 5) Bodovaná otázka: správná odpověď skrytá během odpovídání.
    await next(token, r1, slides[3]);
    await next(token, slides[3], q2);
    pub = (await getPublic(code)).body;
    assert.ok(!JSON.stringify(pub).includes("correctOptionId"), "správná odpověď se během hlasování neposílá");
    const correct2 = q2.options[1].id;
    await vote(code, q2.id, correct2, "anna");
    await vote(code, q2.id, q2.options[0].id, "bert");
    await vote(code, q2.id, correct2, "cyril");

    // Dvojklik na „Další“: druhý stejný požadavek nic nezmění, nepřeskočí slajd.
    const [first, second] = await Promise.all([navigate(token, q2.id, r2.id), navigate(token, q2.id, r2.id)]);
    assert.equal(first.response.status, 200);
    assert.equal(second.response.status, 200);
    assert.equal((await getModerator(token)).body.activeQuestionId, r2.id);
    // Zastaralý požadavek (jiné okno) se odmítne a nepřepne.
    const stale = await navigate(token, q1.id, board1.id);
    assert.equal(stale.response.status, 409);
    assert.equal(stale.body.code, "stale");

    // 7) Průběžný žebříček: Anna 2, Cyril 2 (shoda), Bert 0.
    await next(token, r2, board1);
    state = await slidesOf(token);
    assert.deepEqual(
      state[6].leaderboard?.entries.map((e) => [e.rank, e.tied, e.label, e.points]),
      [
        [1, true, "Anna", 2],
        [1, true, "Cyril", 2],
        [3, false, "Bert", 0],
      ]
    );
    pub = (await getPublic(code)).body;
    assert.deepEqual(pub.slide, { kind: "leaderboard" });
    assert.equal(pub.activeQuestion, null, "při žebříčku nezůstane aktivní formulář");

    // 8) Druhá bodovaná otázka.
    await next(token, board1, q3);
    await vote(code, q3.id, q3.options[0].id, "bert");
    await vote(code, q3.id, q3.options[1].id, "anna");
    await vote(code, q3.id, q3.options[0].id, "cyril");
    await next(token, q3, board2);
    state = await slidesOf(token);
    assert.deepEqual(
      state[8].leaderboard?.entries.map((e) => [e.rank, e.label, e.points]),
      [
        [1, "Cyril", 3],
        [2, "Anna", 2],
        [3, "Bert", 1],
      ]
    );
    // Dřívější žebříček se pozdější otázkou nezmění.
    assert.deepEqual(
      state[6].leaderboard?.entries.map((e) => e.points),
      [2, 2, 0]
    );

    // Návrat zpět na odehranou otázku: neotevře se, hlasy i body zůstanou.
    await next(token, board2, q3);
    state = await slidesOf(token);
    assert.equal(state[7].status, "ended");
    assert.equal(state[7].totalVotes, 3);
    assert.equal((await vote(code, q3.id, q3.options[0].id, "anna")).response.status, 409, "po návratu se nehlasuje");
    await next(token, q3, board2);
    state = await slidesOf(token);
    assert.deepEqual(
      state[8].leaderboard?.entries.map((e) => e.points),
      [3, 2, 1],
      "návrat nepřičte body podruhé"
    );

    // Obnovení stránky účastníka: vrátí se jeho jméno i odpovědi.
    const restored = await participantState(code, "anna");
    assert.equal(restored.response.headers.get("cache-control"), "private, no-store");
    assert.equal(restored.body.name, "Anna");
    assert.equal(restored.body.votes[String(q2.id)], correct2);
    assert.equal(Object.keys(restored.body.votes).length, 3);

    await next(token, board2, outro);
    assert.deepEqual((await getPublic(code)).body.slide, { kind: "content" });

    // Konec: souhrn, e-mail i CSV obsahují jen otázky, ne slajdy.
    assert.equal((await endPoll(token)).status, 200);
    const final = await getFinal(code, "anna");
    assert.deepEqual(
      final.body.questions.map((q: { text: string }) => q.text),
      ["Jak se máte?", "2 + 2 = ?", "Hlavní město ČR?"]
    );
    const view = await getModeratorPoll(token);
    assert.ok(view);
    const emailInput = {
      title: view.title,
      publicCode: code,
      uniqueParticipants: view.uniqueParticipants,
      questions: view.questions.filter((q) => q.status !== "prepared"),
    };
    assert.equal(emailInput.questions.length, 3);
    assert.ok(!buildResultsCsv(emailInput as never).includes("Vítejte"));
    assert.ok(!buildResultsEmail(emailInput as never).html.includes("Průběžné pořadí"));
  });

  test("výsledky ještě nepoložené otázky a ručně otevřená otázka se při navigaci uzavře", async () => {
    const { token, code, slides } = await createDeck();
    const [intro, q1, r1] = slides;
    await next(token, null, intro);
    // Ruční spuštění v konzoli (stará funkce zůstává), pak „Další“ ji uzavře.
    assert.equal((await activate(token, q1.id)).status, 200);
    assert.equal((await activate(token, intro.id)).status, 400, "obsahový slajd nejde spustit jako otázku");
    await vote(code, q1.id, q1.options[0].id, "x");
    await next(token, q1, r1);
    const state = await slidesOf(token);
    assert.equal(state[1].status, "ended");
    // Slajdy, které nejsou otázkou, zůstávají „prepared“ (souhrny je vynechají).
    assert.ok(state.filter((s) => s.kind !== "question").every((s) => s.status === "prepared"));
  });

  test("prezentace bez bodovaných otázek: žebříček s nulami, žádné body za běžné hlasování", async () => {
    const { response, body } = await createPoll({
      title: "Bez bodů",
      questions: [{ text: "Anketa", options: [{ text: "A" }, { text: "B" }] }, { kind: "leaderboard", text: "Pořadí" }],
    });
    assert.equal(response.status, 201);
    const slides = await slidesOf(body.moderatorToken);
    await next(body.moderatorToken, null, slides[0]);
    await vote(body.publicCode, slides[0].id, slides[0].options[0].id, "p1");
    await next(body.moderatorToken, slides[0], slides[1]);
    const board = (await slidesOf(body.moderatorToken))[1].leaderboard;
    assert.equal(board?.scoredQuestionsTotal, 0);
    assert.deepEqual(
      board?.entries.map((e) => [e.label, e.points]),
      [["Anonymní účastník 1", 0]]
    );
  });
});

describe("běhy prezentace", () => {
  test("nový běh = nový kód, stejný obsah, žádné staré odpovědi ani účastníci", async () => {
    const { token, code, slides } = await createDeck({ requireParticipantName: true });
    await register(code, "anna", "Anna");
    await next(token, null, slides[0]);
    await next(token, slides[0], slides[1]);
    await vote(code, slides[1].id, slides[1].options[0].id, "anna");

    const response = await duplicateRoute.POST(jsonRequest("/x", "POST") as never, routeParams({ moderatorToken: token }));
    assert.equal(response.status, 201);
    const copy = await response.json();
    assert.notEqual(copy.publicCode, code);
    assert.notEqual(copy.moderatorToken, token);

    const fresh = await getModerator(copy.moderatorToken);
    assert.equal(fresh.body.totalVotes, 0);
    assert.equal(fresh.body.activeQuestionId, null);
    assert.equal(fresh.body.requireParticipantName, true);
    const copied = fresh.body.questions as ModSlide[];
    assert.deepEqual(
      copied.map((s) => [s.kind, s.text, s.status]),
      slides.map((s) => [s.kind, s.text, "prepared"])
    );
    // Vazby výsledků míří na otázky KOPIE, správné odpovědi a body sedí.
    assert.equal(copied[2].resultsQuestionId, copied[1].id);
    assert.equal(copied[5].resultsQuestionId, copied[4].id);
    assert.equal(copied[4].correctOptionId, copied[4].options[1].id);
    assert.equal(copied[4].points, 2);
    // Účastník starého běhu v novém neexistuje.
    assert.equal((await participantState(copy.publicCode, "anna")).body.name, null);
    // Původní běh beze změny.
    assert.equal((await getModerator(token)).body.totalVotes, 1);
  });
});

async function reset(token: string) {
  const response = await resetRoute.POST(jsonRequest("/x", "POST") as never, routeParams({ moderatorToken: token }));
  return { response, body: await response.json() };
}

describe("bonus za rychlost — prezentace", () => {
  test("uloží se, započítá podle pořadí hlasů, ukáže nejrychlejší, zamkne se po spuštění a přenese do nového běhu", async () => {
    const { response, body } = await createPoll({
      title: "Kvíz",
      requireParticipantName: true,
      questions: [
        { text: "2 + 2?", options: [{ text: "3" }, { text: "4" }], correctOptionIndex: 1, points: 2, speedBonus: true },
        // Bez správné odpovědi se bonus tiše nepoužije.
        { text: "Názor?", options: [{ text: "A" }, { text: "B" }], speedBonus: true },
        { kind: "leaderboard", text: "Pořadí" },
      ],
    });
    assert.equal(response.status, 201, JSON.stringify(body));
    const token = body.moderatorToken as string;
    const code = body.publicCode as string;
    let slides = (await getModerator(token)).body.questions as (ModSlide & { speedBonus: boolean; fastest: unknown })[];
    assert.equal(slides[0].speedBonus, true);
    assert.equal(slides[1].speedBonus, false);

    for (const [id, name] of [["w", "Vojta"], ["a", "Anna"], ["b", "Bert"], ["c", "Cyril"], ["d", "Dana"]]) await register(code, id, name);
    await next(token, null, slides[0]);
    // Sekvenčně = deterministické pořadí zápisu.
    await vote(code, slides[0].id, slides[0].options[0].id, "w");
    for (const id of ["a", "b", "c", "d"]) await vote(code, slides[0].id, slides[0].options[1].id, id);
    // Během odpovídání se nejrychlejší neukazují.
    assert.equal(((await getModerator(token)).body.questions[0] as { fastest: unknown }).fastest, null);
    await next(token, slides[0], slides[2]);

    slides = (await getModerator(token)).body.questions;
    assert.deepEqual(slides[0].fastest, [
      { label: "Anna", bonus: 3 },
      { label: "Bert", bonus: 2 },
      { label: "Cyril", bonus: 1 },
    ]);
    assert.deepEqual(
      slides[2].leaderboard?.entries.map((e) => [e.rank, e.label, e.points]),
      [
        [1, "Anna", 5],
        [2, "Bert", 4],
        [3, "Cyril", 3],
        [4, "Dana", 2],
        [5, "Vojta", 0],
      ]
    );
    // Účastník nedostane seznam nejrychlejších ani nastavení bodů.
    const pub = await getPublic(code);
    assert.ok(!pub.text.includes("fastest") && !pub.text.includes("speedBonus"));

    // Po spuštění otázky bonus nejde vypnout (změnil by žebříček zpětně).
    const payload = withSlides((await getContent(token)).body);
    assert.equal(payload.questions[0].speedBonus, true);
    payload.questions[0].speedBonus = false;
    assert.equal((await putContent(token, payload)).response.status, 409);

    const copy = await (await duplicateRoute.POST(jsonRequest("/x", "POST") as never, routeParams({ moderatorToken: token }))).json();
    assert.equal((await getModerator(copy.moderatorToken)).body.questions[0].speedBonus, true);
  });

  test("neplatná hodnota bonusu se odmítne; staré otázky mají bonus vypnutý", async () => {
    const bad = await createPoll({ questions: [{ text: "Q?", options: [{ text: "A" }, { text: "B" }], correctOptionIndex: 0, speedBonus: "ano" }] });
    assert.equal(bad.response.status, 400);
    const { slides } = await createDeck();
    assert.ok(slides.every((s) => (s as unknown as { speedBonus: boolean }).speedBonus === false));
  });
});

describe("znovu od začátku (vynulování)", () => {
  test("smaže hlasy, body i jména, vrátí otázky na začátek — i po ukončení; kód a odkaz zůstanou", async () => {
    const { token, code, slides } = await createDeck({ requireParticipantName: true });
    await register(code, "anna", "Anna");
    await register(code, "bert", "Bert");
    await next(token, null, slides[0]);
    await next(token, slides[0], slides[1]);
    await vote(code, slides[1].id, slides[1].options[0].id, "anna");
    await next(token, slides[1], slides[4]);
    await vote(code, slides[4].id, slides[4].options[1].id, "anna");
    await vote(code, slides[4].id, slides[4].options[0].id, "bert");
    await next(token, slides[4], slides[6]);
    assert.equal(((await endPoll(token)) as Response).status, 200);

    const { response } = await reset(token);
    assert.equal(response.status, 200);

    const { body: mod } = await getModerator(token);
    assert.equal(mod.pollStatus, "active");
    assert.equal(mod.activeQuestionId, null);
    assert.equal(mod.totalVotes, 0);
    assert.equal(mod.publicCode, code);
    const after = mod.questions as ModSlide[];
    assert.deepEqual(after.map((s) => s.status), slides.map(() => "prepared"));
    assert.deepEqual(after.map((s) => s.id), slides.map((s) => s.id));
    assert.equal(after[6].leaderboard?.entries.length, 0);
    // Účastník musí zadat jméno znovu, jeho staré hlasy zmizely.
    assert.deepEqual((await participantState(code, "anna")).body, { name: null, votes: {} });
    const pub = await getPublic(code);
    assert.equal(pub.body.activeQuestion, null);
    assert.equal(pub.body.closedQuestion, null);

    // Nový průchod funguje od začátku: otázka se znovu otevře, starý hlas nebrání.
    await next(token, null, slides[0]);
    await next(token, slides[0], slides[1]);
    assert.equal((await vote(code, slides[1].id, slides[1].options[1].id, "anna")).response.status, 403);
    await register(code, "anna", "Anna");
    assert.equal((await vote(code, slides[1].id, slides[1].options[1].id, "anna")).response.status, 200);
    // Obsah je zase volně upravitelný (žádná otázka není „odehraná“).
    const { body: content } = await getContent(token);
    const payload = withSlides(content);
    payload.questions[4].points = 5;
    assert.equal((await putContent(token, payload)).response.status, 200);
  });

  test("veřejnou anketu ani neexistující odkaz vynulovat nejde", async () => {
    const { body } = await createPoll({ mode: "self_service", questions: [{ text: "Kam?", options: [{ text: "A" }, { text: "B" }] }] });
    assert.equal((await reset(body.moderatorToken)).response.status, 409);
    assert.equal((await reset("x".repeat(43))).response.status, 404);
  });
});

describe("editor — slajdy a vazby", () => {
  test("přeřazení zachová vazbu, smazaná otázka = chybějící vazba, typ nejde změnit", async () => {
    const { token } = await createDeck();
    const { body: content } = await getContent(token);
    assert.equal(content.questions[2].kind, "results");

    const payload = withSlides(content);
    // Prohodit úvod a první otázku — výsledky stále patří k téže otázce.
    [payload.questions[0], payload.questions[1]] = [payload.questions[1], payload.questions[0]];
    payload.questions[2].resultsQuestionIndex = 0;
    payload.questions[5].resultsQuestionIndex = 4;
    const saved = await putContent(token, payload);
    assert.equal(saved.response.status, 200, JSON.stringify(saved.body));
    assert.equal(saved.body.questions[2].resultsQuestionId, saved.body.questions[0].id);

    // Smazat první otázku: editor pošle výsledky bez vazby → označí se jako chybějící.
    const after = withSlides(saved.body);
    after.questions.splice(0, 1);
    after.questions[1].resultsQuestionIndex = null;
    after.questions[4].resultsQuestionIndex = 3;
    const removed = await putContent(token, after);
    assert.equal(removed.response.status, 200, JSON.stringify(removed.body));
    assert.equal(removed.body.questions[1].resultsQuestionId, null);

    // Změna typu existujícího slajdu se odmítne.
    const kindChange = withSlides(removed.body);
    kindChange.questions[0].kind = "leaderboard";
    kindChange.questions[0].body = null;
    assert.equal((await putContent(token, kindChange)).response.status, 409);
  });

  test("body odehrané otázky nejdou změnit (žebříček by se zpětně změnil)", async () => {
    const { token, code, slides } = await createDeck();
    const q2 = slides[4];
    await next(token, null, q2);
    await vote(code, q2.id, q2.options[1].id, "p");
    const payload = withSlides((await getContent(token)).body);
    payload.questions[4].points = 5;
    const result = await putContent(token, payload);
    assert.equal(result.response.status, 409);
  });

  test("smazání právě promítaného obsahového slajdu vrátí účastníky do čekání", async () => {
    const { token, code, slides } = await createDeck();
    await next(token, null, slides[0]);
    const payload = withSlides((await getContent(token)).body);
    payload.questions.splice(0, 1);
    for (const slide of payload.questions) if (slide.resultsQuestionIndex !== null && slide.resultsQuestionIndex !== undefined) slide.resultsQuestionIndex--;
    assert.equal((await putContent(token, payload)).response.status, 200);
    const pub = (await getPublic(code)).body;
    assert.equal(pub.slide, null);
    assert.equal(pub.activeQuestion, null);
  });
});

describe("kompatibilita", () => {
  test("původní hlasování jen s otázkami funguje beze změny (ruční spuštění/ukončení)", async () => {
    const { response, body } = await createPoll();
    assert.equal(response.status, 201);
    const mod = (await getModerator(body.moderatorToken)).body;
    assert.ok(mod.questions.every((q: ModSlide) => q.kind === "question" && q.leaderboard === null));
    const q = mod.questions[0];
    assert.equal((await activate(body.moderatorToken, q.id)).status, 200);
    assert.equal((await vote(body.publicCode, q.id, q.options[0].id, "p1")).response.status, 200);
    assert.equal((await closeQuestion(body.moderatorToken, q.id)).status, 200);
    const pub = (await getPublic(body.publicCode)).body;
    assert.equal(pub.closedQuestion.id, q.id);
    assert.equal(pub.slide, null);
    // Editor bez typů (starý klient) uloží otázky jako dosud.
    const old = contentToPayload((await getContent(body.moderatorToken)).body);
    assert.equal((await putContent(body.moderatorToken, old)).response.status, 200);
  });
});

/** Obsah editoru → vstup PUT /content včetně slajdů (indexy vazeb podle ID). */
function withSlides(content: {
  version: number;
  title: string | null;
  questions: {
    id: number;
    kind: string;
    text: string;
    body: string | null;
    points: number;
    resultsQuestionId: number | null;
    image: unknown;
    link: unknown;
    options: { id: number; text: string }[];
    correctOptionId?: number | null;
  }[];
}) {
  const base = contentToPayload(content);
  const indexById = new Map(content.questions.map((q, index) => [q.id, index]));
  return {
    ...base,
    questions: base.questions.map((q, index) => {
      const source = content.questions[index];
      const isQuestion = source.kind === "question";
      return {
        ...q,
        kind: source.kind,
        body: source.body,
        points: source.points,
        speedBonus: (source as { speedBonus?: boolean }).speedBonus ?? false,
        link: isQuestion ? q.link : null,
        correctOptionIndex: isQuestion ? q.correctOptionIndex : null,
        resultsQuestionIndex: source.resultsQuestionId === null ? null : (indexById.get(source.resultsQuestionId) ?? null),
      } as Record<string, unknown> & { kind: string; body: string | null; points: number; resultsQuestionIndex: number | null };
    }),
  };
}

describe("prezentace — Zpět z otevřené otázky", () => {
  test("bez hlasů: otázka se vrátí do „připraveno“, Vpřed ji normálně otevře (správná odpověď se neprozradí)", async () => {
    const { token, code, slides } = await createDeck();
    const [intro, q1, r1, content2, q2] = slides;
    assert.equal((await navigate(token, null, intro.id)).response.status, 200);
    for (const [from, to] of [[intro, q1], [q1, r1], [r1, content2], [content2, q2]]) {
      assert.equal((await navigate(token, from.id, to.id)).response.status, 200);
    }
    // q2 je otevřená, nikdo nehlasoval → Zpět.
    assert.equal((await navigate(token, q2.id, content2.id)).response.status, 200);
    const back = (await getModerator(token)).body.questions.find((q: ModSlide) => q.id === q2.id);
    assert.equal(back.status, "prepared");
    assert.equal((await getPublic(code)).body.closedQuestion, null);

    // Vpřed → otevře se znovu, správná odpověď se účastníkům neposílá.
    assert.equal((await navigate(token, content2.id, q2.id)).response.status, 200);
    const open = (await getPublic(code)).body;
    assert.equal(open.activeQuestion.id, q2.id);
    assert.equal(open.closedQuestion, null);
    assert.equal((await getModerator(token)).body.questions.find((q: ModSlide) => q.id === q2.id).status, "active");
  });

  test("s hlasy: Zpět otázku uzavře jako dřív (hlasy i výsledky zůstanou); Vpřed vždy uzavírá", async () => {
    const { token, code, slides } = await createDeck();
    const [intro, q1, r1] = slides;
    await navigate(token, null, intro.id);
    await navigate(token, intro.id, q1.id);
    assert.equal((await vote(code, q1.id, q1.options[0].id, "p1")).response.status, 200);
    await navigate(token, q1.id, intro.id);
    const closed = (await getModerator(token)).body.questions.find((q: ModSlide) => q.id === q1.id);
    assert.equal(closed.status, "ended");
    assert.equal(closed.totalVotes, 1);

    // Vpřed z otevřené otázky bez hlasů = běžné uzavření (beze změny).
    const fresh = await createDeck();
    await navigate(fresh.token, null, fresh.slides[1].id);
    await navigate(fresh.token, fresh.slides[1].id, fresh.slides[2].id);
    assert.equal((await getModerator(fresh.token)).body.questions[1].status, "ended");
    assert.ok(r1);
  });
});
