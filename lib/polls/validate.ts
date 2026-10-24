import { LIMITS } from "./limits.ts";
import type { CreatePollInput, QuestionImage, QuestionLink, UpdatePollInput, UpdatePollQuestionInput } from "./types.ts";

export type ValidationResult = { ok: true; value: CreatePollInput } | { ok: false; error: string };
export type UpdateValidationResult = { ok: true; value: UpdatePollInput } | { ok: false; error: string };

// Jednoduchý e-mail sanity-check — NENÍ to plná RFC validace (netřeba,
// e-mail se jen posílá přes Resend, žádný účet se z něj nevytváří).
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Řetězec, který už začíná nějakým schématem ("https:", "javascript:", …).
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/**
 * Normalizuje uživatelem zadaný odkaz, nebo vrátí null, když není
 * bezpečný. Povolené jsou jen http(s) adresy bez přihlašovacích údajů —
 * `javascript:`, `data:` apod. se odmítnou (XSS). Bez schématu
 * ("www.example.cz/clanek") se doplní https://.
 */
export function normalizeLinkUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > LIMITS.MAX_LINK_URL_LENGTH) return null;
  // Mezery a řídicí znaky uvnitř URL nepatří (a prohlížeče je umí různě
  // "opravovat"), radši odmítnout.
  if (/[\s\u0000-\u001f\u007f]/.test(trimmed)) return null;

  const candidate = HAS_SCHEME.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  if (!url.hostname.includes(".")) return null;

  const normalized = url.toString();
  return normalized.length <= LIMITS.MAX_LINK_URL_LENGTH ? normalized : null;
}

type FieldResult<T> = { ok: true; value: T } | { ok: false; error: string };

export function validateLinkInput(raw: unknown): FieldResult<QuestionLink | null> {
  if (raw === undefined || raw === null) return { ok: true, value: null };
  if (typeof raw !== "object") return { ok: false, error: "neplatný odkaz." };
  const link = raw as Record<string, unknown>;

  if (typeof link.url !== "string") return { ok: false, error: "neplatný odkaz." };
  // Prázdná URL = žádný odkaz (i když je vyplněný popisek).
  if (!link.url.trim()) return { ok: true, value: null };
  const url = normalizeLinkUrl(link.url);
  if (!url) return { ok: false, error: "odkaz musí být platná adresa začínající http:// nebo https://." };

  let label: string | null = null;
  if (link.label !== undefined && link.label !== null) {
    if (typeof link.label !== "string") return { ok: false, error: "popisek odkazu musí být text." };
    const trimmed = link.label.trim();
    if (trimmed.length > LIMITS.MAX_LINK_LABEL_LENGTH) {
      return { ok: false, error: `popisek odkazu může mít nejvýš ${LIMITS.MAX_LINK_LABEL_LENGTH} znaků.` };
    }
    label = trimmed || null;
  }

  return { ok: true, value: { url, label, showDuringVoting: link.showDuringVoting === true } };
}

function isDimension(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= LIMITS.MAX_IMAGE_DIMENSION;
}

/**
 * Jen tvar odkazu na obrázek. To, že URL opravdu patří tomuhle hlasování
 * (vlastní Blob store, prefix polls/<id>/), ověřuje až
 * update-poll-content.ts — tady pollId ještě neznáme.
 */
export function validateImageInput(raw: unknown): FieldResult<QuestionImage | null> {
  if (raw === undefined || raw === null) return { ok: true, value: null };
  if (typeof raw !== "object") return { ok: false, error: "neplatný obrázek." };
  const image = raw as Record<string, unknown>;

  // Jen tvar — skutečnou kontrolu dělá evidence poll_images (k otázce jde
  // uložit jen URL vrácenou naším uploadem do Content API).
  if (typeof image.url !== "string" || !/^https?:\/\//.test(image.url) || image.url.length > LIMITS.MAX_IMAGE_URL_LENGTH) {
    return { ok: false, error: "neplatný obrázek." };
  }
  if (!isDimension(image.width) || !isDimension(image.height)) {
    return { ok: false, error: "neplatné rozměry obrázku." };
  }

  let alt: string | null = null;
  if (image.alt !== undefined && image.alt !== null) {
    if (typeof image.alt !== "string") return { ok: false, error: "popis obrázku musí být text." };
    const trimmed = image.alt.trim();
    if (trimmed.length > LIMITS.MAX_IMAGE_ALT_LENGTH) {
      return { ok: false, error: `popis obrázku může mít nejvýš ${LIMITS.MAX_IMAGE_ALT_LENGTH} znaků.` };
    }
    alt = trimmed || null;
  }

  return { ok: true, value: { url: image.url, width: image.width, height: image.height, alt } };
}

function isId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function validateTitle(raw: unknown): FieldResult<string | undefined> {
  if (raw === undefined || raw === null) return { ok: true, value: undefined };
  if (typeof raw !== "string") return { ok: false, error: "Název musí být text." };
  const trimmed = raw.trim();
  if (trimmed.length > LIMITS.MAX_TITLE_LENGTH) {
    return { ok: false, error: `Název může mít nejvýš ${LIMITS.MAX_TITLE_LENGTH} znaků.` };
  }
  return { ok: true, value: trimmed || undefined };
}

/**
 * Společná validace seznamu otázek pro vytvoření i editaci.
 * "create" = bez ID a bez obrázků (obrázek jde nahrát až s moderátorským
 * tokenem, tj. po vytvoření), "update" = ID existujících otázek/odpovědí
 * a obrázky povolené.
 */
function validateQuestions(raw: unknown, mode: "create" | "update"): FieldResult<UpdatePollQuestionInput[]> {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { ok: false, error: "Přidejte aspoň jednu otázku." };
  }
  if (raw.length > LIMITS.MAX_QUESTIONS) {
    return { ok: false, error: `Hlasování může mít nejvýš ${LIMITS.MAX_QUESTIONS} otázek.` };
  }

  const questions: UpdatePollQuestionInput[] = [];
  for (const [index, rawQuestion] of raw.entries()) {
    const prefix = `Otázka ${index + 1}`;
    if (typeof rawQuestion !== "object" || rawQuestion === null) {
      return { ok: false, error: `${prefix}: neplatný formát.` };
    }
    const q = rawQuestion as Record<string, unknown>;

    let id: number | undefined;
    if (mode === "update" && q.id !== undefined && q.id !== null) {
      if (!isId(q.id)) return { ok: false, error: `${prefix}: neplatné ID.` };
      id = q.id;
    }

    if (typeof q.text !== "string" || q.text.trim().length === 0) {
      return { ok: false, error: `${prefix}: text otázky je povinný.` };
    }
    const text = q.text.trim();
    if (text.length > LIMITS.MAX_QUESTION_LENGTH) {
      return { ok: false, error: `${prefix}: text může mít nejvýš ${LIMITS.MAX_QUESTION_LENGTH} znaků.` };
    }
    if (!Array.isArray(q.options)) {
      return { ok: false, error: `${prefix}: chybí odpovědi.` };
    }
    if (q.options.length < LIMITS.MIN_OPTIONS) {
      return { ok: false, error: `${prefix}: zadejte aspoň ${LIMITS.MIN_OPTIONS} odpovědi.` };
    }
    if (q.options.length > LIMITS.MAX_OPTIONS) {
      return { ok: false, error: `${prefix}: nejvýš ${LIMITS.MAX_OPTIONS} odpovědí.` };
    }

    const options: UpdatePollQuestionInput["options"] = [];
    for (const [optIndex, rawOption] of q.options.entries()) {
      const optPrefix = `${prefix}, odpověď ${optIndex + 1}`;
      if (typeof rawOption !== "object" || rawOption === null) {
        return { ok: false, error: `${optPrefix}: neplatný formát.` };
      }
      const opt = rawOption as Record<string, unknown>;
      if (typeof opt.text !== "string" || opt.text.trim().length === 0) {
        return { ok: false, error: `${optPrefix}: text je povinný.` };
      }
      const optionText = opt.text.trim();
      if (optionText.length > LIMITS.MAX_OPTION_LENGTH) {
        return { ok: false, error: `${optPrefix}: nejvýš ${LIMITS.MAX_OPTION_LENGTH} znaků.` };
      }
      let optionId: number | undefined;
      if (mode === "update" && opt.id !== undefined && opt.id !== null) {
        if (!isId(opt.id)) return { ok: false, error: `${optPrefix}: neplatné ID.` };
        optionId = opt.id;
      }
      options.push(optionId === undefined ? { text: optionText } : { id: optionId, text: optionText });
    }

    const link = validateLinkInput(q.link);
    if (!link.ok) return { ok: false, error: `${prefix}: ${link.error}` };

    let image: UpdatePollQuestionInput["image"] = null;
    if (mode === "update") {
      const validatedImage = validateImageInput(q.image);
      if (!validatedImage.ok) return { ok: false, error: `${prefix}: ${validatedImage.error}` };
      image = validatedImage.value;
    } else if (q.image !== undefined && q.image !== null) {
      return { ok: false, error: `${prefix}: obrázek lze nahrát až po vytvoření hlasování.` };
    }

    // Nepovinná správná odpověď = index do `options` (nejvýš jedna z principu).
    let correctOptionIndex: number | null = null;
    if (q.correctOptionIndex !== undefined && q.correctOptionIndex !== null) {
      if (!Number.isInteger(q.correctOptionIndex) || (q.correctOptionIndex as number) < 0 || (q.correctOptionIndex as number) >= options.length) {
        return { ok: false, error: `${prefix}: neplatná správná odpověď.` };
      }
      correctOptionIndex = q.correctOptionIndex as number;
    }

    questions.push({ ...(id === undefined ? {} : { id }), text, options, image, link: link.value, correctOptionIndex });
  }

  return { ok: true, value: questions };
}

/**
 * Server-side validace vstupu pro vytvoření hlasování — nikdy nedůvěřuj
 * jen klientské validaci (viz zadání "validuj vstupy server-side").
 * Čistá funkce bez DB, snadno testovatelná (viz test/validate-poll.test.ts).
 */
/**
 * Jméno/přezdívka účastníka jmenovitého hlasování: ořízne a sloučí
 * mezery, 1–40 znaků, bez řídicích a neviditelných znaků, aspoň jedno
 * písmeno nebo číslice. `null` = neplatné. (HTML escapuje React, CSV
 * injection řeší export.)
 */
export function normalizeParticipantName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.normalize("NFC").replace(/\s+/g, " ").trim();
  if (name.length < 1 || name.length > LIMITS.MAX_PARTICIPANT_NAME_LENGTH) return null;
  if (/[\p{Cc}\p{Cf}\u2028\u2029]/u.test(name)) return null;
  if (!/[\p{L}\p{N}]/u.test(name)) return null;
  return name;
}

export function validateCreatePollInput(input: unknown): ValidationResult {
  if (typeof input !== "object" || input === null) {
    return { ok: false, error: "Neplatný požadavek." };
  }
  const body = input as Record<string, unknown>;

  const title = validateTitle(body.title);
  if (!title.ok) return title;

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

  const questions = validateQuestions(body.questions, "create");
  if (!questions.ok) return questions;

  return {
    ok: true,
    value: {
      title: title.value,
      email,
      requireParticipantName: body.requireParticipantName === true,
      questions: questions.value.map((q) => ({
        text: q.text,
        options: q.options.map((o) => ({ text: o.text })),
        link: q.link,
        correctOptionIndex: q.correctOptionIndex,
      })),
    },
  };
}

/** Validace uložení z editoru (PUT /api/polls/moderator/<token>/content). */
export function validateUpdatePollInput(input: unknown): UpdateValidationResult {
  if (typeof input !== "object" || input === null) {
    return { ok: false, error: "Neplatný požadavek." };
  }
  const body = input as Record<string, unknown>;

  if (typeof body.version !== "number" || !Number.isSafeInteger(body.version) || body.version < 1) {
    return { ok: false, error: "Chybí verze hlasování. Načtěte stránku znovu." };
  }

  const title = validateTitle(body.title);
  if (!title.ok) return title;

  const questions = validateQuestions(body.questions, "update");
  if (!questions.ok) return questions;

  return { ok: true, value: { version: body.version, title: title.value, questions: questions.value } };
}
