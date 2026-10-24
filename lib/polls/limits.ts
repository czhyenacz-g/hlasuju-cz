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

  MAX_LINK_URL_LENGTH: 2000,
  MAX_LINK_LABEL_LENGTH: 100,
  MAX_IMAGE_URL_LENGTH: 1000,
  MAX_IMAGE_ALT_LENGTH: 300,
  // Server přijme max 4 MB — Vercel Functions mají limit těla požadavku
  // 4,5 MB, takže víc přes vlastní API stejně neprojde. Prohlížeč větší
  // fotky před nahráním zmenší (lib/images/prepare-image.ts), proto si
  // uživatel může vybrat i větší originál.
  MAX_IMAGE_BYTES: 4 * 1024 * 1024,
  MAX_ORIGINAL_IMAGE_BYTES: 25 * 1024 * 1024,
  // Delší strana po zmenšení v prohlížeči — pořád víc než Full HD
  // projektor, detaily fotek (např. zranění) zůstanou čitelné.
  IMAGE_RESIZE_MAX_DIMENSION: 2400,
  MAX_IMAGE_DIMENSION: 8000,

  // Horní meze velikosti JSON těla požadavků (lib/http.ts).
  MAX_CREATE_BODY_BYTES: 256 * 1024,
  MAX_CONTENT_BODY_BYTES: 256 * 1024,
  MAX_SMALL_BODY_BYTES: 4 * 1024,
} as const;
