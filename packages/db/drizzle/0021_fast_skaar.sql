CREATE TABLE "game_reasons" (
	"user_id" text NOT NULL,
	"igdb_id" integer NOT NULL,
	"recs_version" integer NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "game_reasons_user_id_igdb_id_pk" PRIMARY KEY("user_id","igdb_id")
);
--> statement-breakpoint
CREATE TABLE "llm_usage" (
	"key" text NOT NULL,
	"day" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "llm_usage_key_day_pk" PRIMARY KEY("key","day")
);
--> statement-breakpoint
ALTER TABLE "game_reasons" ADD CONSTRAINT "game_reasons_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;