import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { normalizeLinkUrl, validateCreatePollInput, validateImageInput, validateLinkInput, validateUpdatePollInput } from "../lib/polls/validate.ts";

describe("normalizeLinkUrl — jen bezpečné http(s)", () => {
  test("povolí http/https a doplní https:// když chybí schéma", () => {
    assert.equal(normalizeLinkUrl("https://www.wikiskripta.eu/w/Rána"), "https://www.wikiskripta.eu/w/R%C3%A1na");
    assert.equal(normalizeLinkUrl("http://example.com"), "http://example.com/");
    assert.equal(normalizeLinkUrl("  www.example.cz/clanek  "), "https://www.example.cz/clanek");
  });

  test("odmítne nebezpečná schémata a podivné adresy", () => {
    for (const bad of [
      "javascript:alert(1)",
      "JavaScript:alert(1)",
      " javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox(1)",
      "file:///etc/passwd",
      "ftp://example.com",
      "https://user:pass@example.com",
      "https://exa mple.com",
      "https://localhost",
      "java\tscript:alert(1)",
      "",
      "https://" + "a".repeat(2000) + ".com",
    ]) {
      assert.equal(normalizeLinkUrl(bad), null, bad);
    }
  });

  test("validateLinkInput: popisek, prázdná URL = žádný odkaz, výchozí skrytí", () => {
    assert.deepEqual(validateLinkInput({ url: "example.com", label: " Zdroj " }), {
      ok: true,
      value: { url: "https://example.com/", label: "Zdroj", showDuringVoting: false },
    });
    assert.deepEqual(validateLinkInput({ url: "  ", label: "x" }), { ok: true, value: null });
    assert.equal(validateLinkInput({ url: "javascript:alert(1)" }).ok, false);
    assert.equal(validateLinkInput({ url: "https://example.com", label: "x".repeat(101) }).ok, false);
  });
});

describe("validateImageInput", () => {
  test("tvar obrázku", () => {
    assert.equal(validateImageInput({ url: "https://content-api.darbujan.com/media/1", width: 10, height: 10 }).ok, true);
    assert.equal(validateImageInput({ url: "data:image/png;base64,AAAA", width: 10, height: 10 }).ok, false);
    assert.equal(validateImageInput({ url: "https://x/y.png", width: 0, height: 10 }).ok, false);
    assert.equal(validateImageInput({ url: "https://x/y.png", width: 1.5, height: 10 }).ok, false);
    assert.equal(validateImageInput({ url: "javascript:alert(1)", width: 10, height: 10 }).ok, false);
  });
});

describe("validace vytvoření / uložení", () => {
  const question = { text: "Q", options: [{ text: "A" }, { text: "B" }] };

  test("vytvoření nepřijme obrázek (token ještě neexistuje), přijme odkaz", () => {
    assert.equal(validateCreatePollInput({ questions: [{ ...question, image: { url: "https://x/y.png", width: 1, height: 1 } }] }).ok, false);
    const ok = validateCreatePollInput({ questions: [{ ...question, link: { url: "example.com" } }] });
    assert.equal(ok.ok, true);
    if (ok.ok) assert.equal(ok.value.questions[0].link?.url, "https://example.com/");
  });

  test("uložení vyžaduje verzi a platná ID", () => {
    assert.equal(validateUpdatePollInput({ questions: [question] }).ok, false);
    assert.equal(validateUpdatePollInput({ version: 1, questions: [{ ...question, id: -1 }] }).ok, false);
    assert.equal(validateUpdatePollInput({ version: 1, questions: [{ ...question, id: 5, options: [{ id: "x", text: "A" }, { text: "B" }] }] }).ok, false);
    assert.equal(validateUpdatePollInput({ version: 1, questions: [{ ...question, id: 5 }] }).ok, true);
  });
});
