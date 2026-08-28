import { index, integer, pgTable, serial, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";

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
