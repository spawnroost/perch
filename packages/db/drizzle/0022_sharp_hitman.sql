CREATE TABLE "game_player_voice" (
	"igdb_id" integer PRIMARY KEY NOT NULL,
	"payload" jsonb,
	"review_count" integer DEFAULT 0 NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "game_player_voice" ADD CONSTRAINT "game_player_voice_igdb_id_games_igdb_id_fk" FOREIGN KEY ("igdb_id") REFERENCES "public"."games"("igdb_id") ON DELETE cascade ON UPDATE no action;