import { boolean, index, integer, pgTable, primaryKey, serial, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";

// Nejjednodušší schéma, které pokrývá zadání: poll -> otázky -> možnosti,
// hlasy zvlášť (1:N na otázku, ne sloupec navíc na option) — viz zadání.
// Žádné participant/user tabulky (žádná registrace, viz zadání) —
// `participant_id` je jen náhodný string generovaný v prohlížeči
// (localStorage), ne cizí klíč na nic.

export const polls = pgTable(
  "polls",
  {
    id: serial("id").primaryKey(),
    title: varchar("title", { length: 200 }),
    // 6místný číselný kód (viz lib/polls/tokens.ts) — krátký, dobře
    // opisovatelný, NENÍ to autentizace (viz zadání "nepoužívej krátký
    // veřejný kód jako autentizaci moderátora").
    publicCode: varchar("public_code", { length: 12 }).notNull(),
    // Dlouhý kryptograficky náhodný token — jediná autentizace
    // moderátora (capability URL vzor). Nikdy se nevrací v žádné
    // veřejné/účastnické odpovědi API.
    moderatorToken: varchar("moderator_token", { length: 64 }).notNull(),
    email: varchar("email", { length: 320 }),
    // "active" | "closed" — viz lib/polls/types.ts pro přesné hodnoty.
    status: varchar("status", { length: 16 }).notNull().default("active"),
    // Záměrně BEZ .references() na questions.id — kruhová závislost mezi
    // tabulkama (questions.poll_id -> polls.id) by šla vyřešit, ale pro
    // tenhle jednoduchý model to není potřeba (viz zadání "pokud lze
    // model zjednodušit, udělej to"); referenční integritu tady hlídá
    // jen aplikační kód (activate-question.ts).
    activeQuestionId: integer("active_question_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    // Expirace se jen respektuje při čtení (WHERE expires_at > now()),
    // žádný cron/fyzické mazání pro MVP, viz zadání.
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    // Optimistický zámek pro editaci obsahu (lib/polls/update-poll-content.ts)
    // — každé uložení ho zvýší, uložení se starší verzí se odmítne, takže
    // dvě otevřená okna editoru si tiše nepřepíšou změny.
    version: integer("version").notNull().default(1),
  },
  (table) => [
    uniqueIndex("polls_public_code_unique").on(table.publicCode),
    uniqueIndex("polls_moderator_token_unique").on(table.moderatorToken),
  ]
);

export const questions = pgTable(
  "questions",
  {
    id: serial("id").primaryKey(),
    pollId: integer("poll_id")
      .notNull()
      .references(() => polls.id, { onDelete: "cascade" }),
    text: varchar("text", { length: 300 }).notNull(),
    position: integer("position").notNull(),
    // "prepared" | "active" | "ended"
    status: varchar("status", { length: 16 }).notNull().default("prepared"),
    // Obrázek je v Universal Content API, tady jen jeho veřejná URL
    // (smí to být jen URL z poll_images tohoto hlasování, viz
    // lib/polls/update-poll-content.ts) + rozměry a alt text.
    imageUrl: varchar("image_url", { length: 1000 }),
    imageWidth: integer("image_width"),
    imageHeight: integer("image_height"),
    imageAlt: varchar("image_alt", { length: 300 }),
    // Volitelný odkaz (zdroj / další informace). Jen http(s), viz
    // lib/polls/validate.ts. Účastníkům se ve výchozím stavu ukáže až po
    // ukončení otázky — odkaz může prozradit správnou odpověď.
    linkUrl: varchar("link_url", { length: 2000 }),
    linkLabel: varchar("link_label", { length: 100 }),
    linkShowDuringVoting: boolean("link_show_during_voting").notNull().default(false),
  },
  (table) => [index("questions_poll_id_idx").on(table.pollId)]
);

export const options = pgTable(
  "options",
  {
    id: serial("id").primaryKey(),
    questionId: integer("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    text: varchar("text", { length: 150 }).notNull(),
    position: integer("position").notNull(),
  },
  (table) => [index("options_question_id_idx").on(table.questionId)]
);

export const votes = pgTable(
  "votes",
  {
    id: serial("id").primaryKey(),
    questionId: integer("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    optionId: integer("option_id")
      .notNull()
      .references(() => options.id, { onDelete: "cascade" }),
    // Náhodné ID z localStorage účastníka — NENÍ to osobní údaj, jen
    // technický identifikátor prohlížeče pro tohle jedno hlasování.
    participantId: varchar("participant_id", { length: 64 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Jádro ochrany proti dvojitému hlasování — atomický DB constraint,
    // ne jen kontrola na aplikační úrovni (ta by měla race condition
    // při dvou souběžných requestech), viz zadání.
    uniqueIndex("votes_question_participant_unique").on(table.questionId, table.participantId),
  ]
);

// Počítadla pro rate limiting (lib/rate-limit.ts) — fixní okna, jeden řádek
// na (klíč, začátek okna). Postgres místo in-memory Map, protože na Vercelu
// běží víc instancí funkcí a paměť mezi nimi sdílená není. Staré řádky
// maže denní cron (app/api/cron/cleanup).
export const rateLimits = pgTable(
  "rate_limits",
  {
    key: varchar("key", { length: 200 }).notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull().default(0),
  },
  (table) => [
    primaryKey({ columns: [table.key, table.windowStart] }),
    index("rate_limits_window_start_idx").on(table.windowStart),
  ]
);

// Evidence obrázků nahraných do Universal Content API (lib/images/). Každý
// upload sem zapíše řádek s ID média v Content API — podle toho se ověřuje,
// že URL ukládaná k otázce patří tomuhle hlasování, a maže se (Content API
// nemá výpis médií, úklid se proto řídí odsud). Řádky se nemažou, smazání
// souboru jen nastaví deleted_at.
export const pollImages = pgTable(
  "poll_images",
  {
    id: serial("id").primaryKey(),
    pollId: integer("poll_id")
      .notNull()
      .references(() => polls.id, { onDelete: "cascade" }),
    storageId: varchar("storage_id", { length: 100 }).notNull(),
    url: varchar("url", { length: 1000 }).notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("poll_images_storage_id_unique").on(table.storageId),
    uniqueIndex("poll_images_url_unique").on(table.url),
    index("poll_images_poll_id_idx").on(table.pollId),
  ]
);
