ALTER TABLE "recommendation_cache" ADD COLUMN "version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "recs_version" integer DEFAULT 0 NOT NULL;