CREATE TABLE IF NOT EXISTS "rate_limits" (
	"key" varchar(200) NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "rate_limits_key_window_start_pk" PRIMARY KEY("key","window_start")
);
--> statement-breakpoint
ALTER TABLE "polls" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "image_url" varchar(1000);--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "image_width" integer;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "image_height" integer;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "image_alt" varchar(300);--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "link_url" varchar(2000);--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "link_label" varchar(100);--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "link_show_during_voting" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rate_limits_window_start_idx" ON "rate_limits" USING btree ("window_start");