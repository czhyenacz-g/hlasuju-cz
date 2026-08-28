import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { validateCreatePollInput } from "../lib/polls/validate.ts";

function validQuestion(overrides: Partial<{ text: string; options: { text: string }[] }> = {}) {
  return { text: "Jak se vám líbí školení?", options: [{ text: "Výborně" }, { text: "Špatně" }], ...overrides };
}

describe("validateCreatePollInput", () => {
  test("accepts a minimal valid poll", () => {
    const result = validateCreatePollInput({ questions: [validQuestion()] });
    assert.equal(result.ok, true);
  });

  test("rejects non-object input", () => {
    const result = validateCreatePollInput("nope");
    assert.equal(result.ok, false);
  });

  test("rejects missing questions", () => {
    const result = validateCreatePollInput({ questions: [] });
    assert.equal(result.ok, false);
  });

  test("rejects more than MAX_QUESTIONS", () => {
    const questions = Array.from({ length: 31 }, () => validQuestion());
    const result = validateCreatePollInput({ questions });
    assert.equal(result.ok, false);
  });

  test("rejects a question with fewer than 2 options", () => {
    const result = validateCreatePollInput({ questions: [validQuestion({ options: [{ text: "Jen jedna" }] })] });
    assert.equal(result.ok, false);
  });

  test("rejects a question with more than 10 options", () => {
    const options = Array.from({ length: 11 }, (_, i) => ({ text: `Možnost ${i}` }));
    const result = validateCreatePollInput({ questions: [validQuestion({ options })] });
    assert.equal(result.ok, false);
  });

  test("rejects an empty option text", () => {
    const result = validateCreatePollInput({ questions: [validQuestion({ options: [{ text: "OK" }, { text: "  " }] })] });
    assert.equal(result.ok, false);
  });

  test("rejects an invalid email but allows an empty one", () => {
    const invalid = validateCreatePollInput({ email: "not-an-email", questions: [validQuestion()] });
    assert.equal(invalid.ok, false);

    const empty = validateCreatePollInput({ email: "", questions: [validQuestion()] });
    assert.equal(empty.ok, true);
  });

  test("trims title and drops it when blank", () => {
    const result = validateCreatePollInput({ title: "  Školení BOZP  ", questions: [validQuestion()] });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.value.title, "Školení BOZP");

    const blank = validateCreatePollInput({ title: "   ", questions: [validQuestion()] });
    assert.equal(blank.ok, true);
    if (blank.ok) assert.equal(blank.value.title, undefined);
  });
});
