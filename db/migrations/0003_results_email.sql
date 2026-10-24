ALTER TABLE "polls" ADD COLUMN "results_email_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "polls" ADD COLUMN "results_email_count" integer DEFAULT 0 NOT NULL;