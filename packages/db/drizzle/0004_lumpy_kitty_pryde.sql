DROP INDEX "feedback_user_game_idx";--> statement-breakpoint
ALTER TABLE "feedback" ADD COLUMN "slot" text GENERATED ALWAYS AS (case when kind in ('up', 'down') then 'vote' else kind end) STORED;--> statement-breakpoint
CREATE UNIQUE INDEX "feedback_user_game_slot_idx" ON "feedback" USING btree ("user_id","igdb_id","slot");