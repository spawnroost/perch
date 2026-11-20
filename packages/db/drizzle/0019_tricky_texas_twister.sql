ALTER TABLE "users" ADD COLUMN "psn_account_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "psn_online_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "psn_synced_at" timestamp with time zone;