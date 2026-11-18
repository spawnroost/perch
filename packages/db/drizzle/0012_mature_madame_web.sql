CREATE TABLE "steam_app_map" (
	"appid" integer PRIMARY KEY NOT NULL,
	"igdb_id" integer,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "steam_synced_at" timestamp with time zone;