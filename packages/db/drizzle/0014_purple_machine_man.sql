ALTER TABLE "games" ADD COLUMN "developers" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "publishers" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "multiplayer" jsonb;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "dlc_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "expansion_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "series_name" text;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "about_fetched_at" timestamp with time zone;