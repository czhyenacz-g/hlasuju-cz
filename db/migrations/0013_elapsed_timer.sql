ALTER TABLE "questions" ADD COLUMN "show_timer" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "timer_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "timer_stopped_at" timestamp with time zone;--> statement-breakpoint
-- Existující otázky dostanou stejný výchozí stav jako nové (čas zobrazovat);
-- obsahové a další slajdy zůstávají vypnuté. Staré odpočty
-- (time_limit_seconds, answer_deadline) se nemažou, jen se už nepoužívají.
UPDATE "questions" SET "show_timer" = true WHERE "kind" = 'question';
