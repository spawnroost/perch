CREATE TABLE "game_prices" (
	"igdb_id" integer PRIMARY KEY NOT NULL,
	"payload" jsonb,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "game_prices" ADD CONSTRAINT "game_prices_igdb_id_games_igdb_id_fk" FOREIGN KEY ("igdb_id") REFERENCES "public"."games"("igdb_id") ON DELETE cascade ON UPDATE no action;