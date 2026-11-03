ALTER TABLE "questions" ADD COLUMN "time_limit_seconds" integer;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "answer_deadline" timestamp with time zone;