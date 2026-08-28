import { LIMITS } from "./limits.ts";
import type { CreatePollInput } from "./types.ts";

export type ValidationResult = { ok: true; value: CreatePollInput } | { ok: false; error: string };

// Jednoduchý e-mail sanity-check — NENÍ to plná RFC validace (netřeba,
// e-mail se jen posílá přes Resend, žádný účet se z něj nevytváří).
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Server-side validace vstupu pro vytvoření hlasování — nikdy nedůvěřuj
 * jen klientské validaci (viz zadání "validuj vstupy server-side").
 * Čistá funkce bez DB, snadno testovatelná (viz test/validate-poll.test.ts).
 */
export function validateCreatePollInput(input: unknown): ValidationResult {
  if (typeof input !== "object" || input === null) {
    return { ok: false, error: "Neplatný požadavek." };
  }
  const body = input as Record<string, unknown>;

  let title: string | undefined;
  if (body.title !== undefined && body.title !== null) {
    if (typeof body.title !== "string") return { ok: false, error: "Název musí být text." };
    const trimmed = body.title.trim();
    if (trimmed.length > LIMITS.MAX_TITLE_LENGTH) {
      return { ok: false, error: `Název může mít nejvýš ${LIMITS.MAX_TITLE_LENGTH} znaků.` };
    }
    title = trimmed || undefined;
  }

  let email: string | undefined;
  if (body.email !== undefined && body.email !== null) {
    if (typeof body.email !== "string") return { ok: false, error: "E-mail musí být text." };
    const trimmed = body.email.trim();
    if (trimmed) {
      if (trimmed.length > LIMITS.MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(trimmed)) {
        return { ok: false, error: "Zadejte platný e-mail, nebo pole nechte prázdné." };
      }
      email = trimmed;
    }
  }

  if (!Array.isArray(body.questions) || body.questions.length === 0) {
    return { ok: false, error: "Přidejte aspoň jednu otázku." };
  }
  if (body.questions.length > LIMITS.MAX_QUESTIONS) {
    return { ok: false, error: `Hlasování může mít nejvýš ${LIMITS.MAX_QUESTIONS} otázek.` };
  }

  const questions: CreatePollInput["questions"] = [];
  for (const [index, raw] of body.questions.entries()) {
    if (typeof raw !== "object" || raw === null) {
      return { ok: false, error: `Otázka ${index + 1}: neplatný formát.` };
    }
    const q = raw as Record<string, unknown>;
    if (typeof q.text !== "string" || q.text.trim().length === 0) {
      return { ok: false, error: `Otázka ${index + 1}: text otázky je povinný.` };
    }
    const text = q.text.trim();
    if (text.length > LIMITS.MAX_QUESTION_LENGTH) {
      return { ok: false, error: `Otázka ${index + 1}: text může mít nejvýš ${LIMITS.MAX_QUESTION_LENGTH} znaků.` };
    }
    if (!Array.isArray(q.options)) {
      return { ok: false, error: `Otázka ${index + 1}: chybí odpovědi.` };
    }
    if (q.options.length < LIMITS.MIN_OPTIONS) {
      return { ok: false, error: `Otázka ${index + 1}: zadejte aspoň ${LIMITS.MIN_OPTIONS} odpovědi.` };
    }
    if (q.options.length > LIMITS.MAX_OPTIONS) {
      return { ok: false, error: `Otázka ${index + 1}: nejvýš ${LIMITS.MAX_OPTIONS} odpovědí.` };
    }

    const options: CreatePollInput["questions"][number]["options"] = [];
    for (const [optIndex, rawOption] of q.options.entries()) {
      if (typeof rawOption !== "object" || rawOption === null) {
        return { ok: false, error: `Otázka ${index + 1}, odpověď ${optIndex + 1}: neplatný formát.` };
      }
      const opt = rawOption as Record<string, unknown>;
      if (typeof opt.text !== "string" || opt.text.trim().length === 0) {
        return { ok: false, error: `Otázka ${index + 1}, odpověď ${optIndex + 1}: text je povinný.` };
      }
      const optionText = opt.text.trim();
      if (optionText.length > LIMITS.MAX_OPTION_LENGTH) {
        return {
          ok: false,
          error: `Otázka ${index + 1}, odpověď ${optIndex + 1}: nejvýš ${LIMITS.MAX_OPTION_LENGTH} znaků.`,
        };
      }
      options.push({ text: optionText });
    }

    questions.push({ text, options });
  }

  return { ok: true, value: { title, email, questions } };
}
