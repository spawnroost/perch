ALTER TABLE "users" ADD COLUMN "steam_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_steam_id_unique" UNIQUE("steam_id");