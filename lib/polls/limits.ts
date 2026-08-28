// Centralizované limity — viz zadání "přidej rozumné limity". Server-side
// vynucované ve validate.ts, ne jen v UI (aby šlo požadavky validovat
// bezpečně bez ohledu na klienta).
export const LIMITS = {
  MAX_TITLE_LENGTH: 200,
  MAX_QUESTIONS: 30,
  MIN_OPTIONS: 2,
  MAX_OPTIONS: 10,
  MAX_QUESTION_LENGTH: 300,
  MAX_OPTION_LENGTH: 150,
  MAX_EMAIL_LENGTH: 320,
  POLL_TTL_DAYS: 30,
} as const;
