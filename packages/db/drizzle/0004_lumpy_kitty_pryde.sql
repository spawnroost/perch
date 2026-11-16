DROP INDEX "feedback_user_game_idx";--> statement-breakpoint
ALTER TABLE "feedback" ADD COLUMN "slot" text GENERATED ALWAYS AS (case when kind in ('up', 'down') then 'vote' else kind end) STORED;--> statement-breakpoint
DELETE FROM "feedback" f USING "feedback" newer
WHERE f."user_id" = newer."user_id"
  AND f."igdb_id" = newer."igdb_id"
  AND f."slot" = newer."slot"
  AND (f."at", f."id") < (newer."at", newer."id");--> statement-breakpoint
CREATE UNIQUE INDEX "feedback_user_game_slot_idx" ON "feedback" USING btree ("user_id","igdb_id","slot");