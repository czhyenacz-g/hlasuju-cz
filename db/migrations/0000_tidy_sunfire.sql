CREATE TABLE IF NOT EXISTS "options" (
	"id" serial PRIMARY KEY NOT NULL,
	"question_id" integer NOT NULL,
	"text" varchar(150) NOT NULL,
	"position" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "polls" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar(200),
	"public_code" varchar(12) NOT NULL,
	"moderator_token" varchar(64) NOT NULL,
	"email" varchar(320),
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"active_question_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "questions" (
	"id" serial PRIMARY KEY NOT NULL,
	"poll_id" integer NOT NULL,
	"text" varchar(300) NOT NULL,
	"position" integer NOT NULL,
	"status" varchar(16) DEFAULT 'prepared' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "votes" (
	"id" serial PRIMARY KEY NOT NULL,
	"question_id" integer NOT NULL,
	"option_id" integer NOT NULL,
	"participant_id" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "options" ADD CONSTRAINT "options_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "questions" ADD CONSTRAINT "questions_poll_id_polls_id_fk" FOREIGN KEY ("poll_id") REFERENCES "public"."polls"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "votes" ADD CONSTRAINT "votes_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "votes" ADD CONSTRAINT "votes_option_id_options_id_fk" FOREIGN KEY ("option_id") REFERENCES "public"."options"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "options_question_id_idx" ON "options" USING btree ("question_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "polls_public_code_unique" ON "polls" USING btree ("public_code");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "polls_moderator_token_unique" ON "polls" USING btree ("moderator_token");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "questions_poll_id_idx" ON "questions" USING btree ("poll_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "votes_question_participant_unique" ON "votes" USING btree ("question_id","participant_id");