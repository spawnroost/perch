ALTER TABLE "games" ADD COLUMN "critic_rating" real;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "critic_rating_count" integer;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "websites" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "steam_review_desc" text;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "steam_review_pct" integer;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "steam_review_total" integer;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "steam_review_fetched_at" timestamp with time zone;