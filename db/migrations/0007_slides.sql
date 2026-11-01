ALTER TABLE "questions" ADD COLUMN "kind" varchar(20) DEFAULT 'question' NOT NULL;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "body" varchar(2000);--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "results_question_id" integer;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "points" integer DEFAULT 1 NOT NULL;