CREATE TABLE IF NOT EXISTS "poll_images" (
	"id" serial PRIMARY KEY NOT NULL,
	"poll_id" integer NOT NULL,
	"storage_id" varchar(100) NOT NULL,
	"url" varchar(1000) NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "poll_images" ADD CONSTRAINT "poll_images_poll_id_polls_id_fk" FOREIGN KEY ("poll_id") REFERENCES "public"."polls"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "poll_images_storage_id_unique" ON "poll_images" USING btree ("storage_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "poll_images_url_unique" ON "poll_images" USING btree ("url");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "poll_images_poll_id_idx" ON "poll_images" USING btree ("poll_id");