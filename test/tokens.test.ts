import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { generateModeratorToken, generatePublicCode } from "../lib/polls/tokens.ts";

describe("generatePublicCode", () => {
  test("returns a 6-digit numeric string", () => {
    for (let i = 0; i < 50; i++) {
      const code = generatePublicCode();
      assert.match(code, /^\d{6}$/);
    }
  });
});

describe("generateModeratorToken", () => {
  test("returns a long, URL-safe, unguessable-length token", () => {
    const token = generateModeratorToken();
    assert.ok(token.length >= 40, "token should have high entropy");
    assert.match(token, /^[A-Za-z0-9_-]+$/);
  });

  test("returns a different token every time", () => {
    const a = generateModeratorToken();
    const b = generateModeratorToken();
    assert.notEqual(a, b);
  });
});
