// Centralizované limity — viz zadání "přidej rozumné limity". Server-side
// vynucované ve validate.ts, ne jen v UI (aby šlo požadavky validovat
// bezpečně bez ohledu na klienta).
export const LIMITS = {
  MAX_TITLE_LENGTH: 200,
  MAX_QUESTIONS: 30,
  // Prezentace: otázky + obsahové, výsledkové a žebříčkové slajdy celkem.
  MAX_SLIDES: 60,
  MAX_SLIDE_BODY_LENGTH: 1500,
  // Od kolika znaků editor upozorní, že text bude na plátně hůř čitelný.
  SLIDE_BODY_WARN_LENGTH: 400,
  SLIDE_TITLE_WARN_LENGTH: 90,
  MAX_POINTS: 100,
  /** Bonus za rychlost pro 1., 2. a 3. správnou odpověď. */
  SPEED_BONUS: [3, 2, 1] as readonly number[],
  // Žebříček na plátně: kolik míst na jednu stránku.
  LEADERBOARD_PAGE_SIZE: 10,
  MIN_OPTIONS: 2,
  MAX_OPTIONS: 10,
  MAX_QUESTION_LENGTH: 300,
  MAX_OPTION_LENGTH: 150,
  MAX_EMAIL_LENGTH: 320,
  POLL_TTL_DAYS: 30,
  MAX_PARTICIPANT_NAME_LENGTH: 40,

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
  // Delší strana po zmenšení v prohlížeči — pokryje i 4K projektor
  // a přiblížení na telefonu (detailní snímky, např. rentgen). Velikost
  // souboru dál hlídá MAX_IMAGE_BYTES (pevný strop hostingu).
  IMAGE_RESIZE_MAX_DIMENSION: 4096,
  // Záložní rozměr, když se snímek ve 4096 px nevejde do 4 MB (původní limit).
  IMAGE_RESIZE_FALLBACK_DIMENSION: 2400,
  MAX_IMAGE_DIMENSION: 8000,

  // Horní meze velikosti JSON těla požadavků (lib/http.ts).
  MAX_CREATE_BODY_BYTES: 256 * 1024,
  MAX_CONTENT_BODY_BYTES: 256 * 1024,
  MAX_SMALL_BODY_BYTES: 4 * 1024,
} as const;
