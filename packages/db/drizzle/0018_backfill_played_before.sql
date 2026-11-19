-- Imports made before the played-before prompt existed: ask about backlog entries from Steam and
-- file imports with at least an hour of playtime that were not played in the last 30 days.
-- Xbox entries are skipped: their achievement progress was not stored.
UPDATE "library_entries"
SET "played_before_pending" = true
WHERE "status" = 'backlog'
  AND "source" IN ('steam', 'import')
  AND "hours_played" >= 1
  AND ("last_played" IS NULL OR "last_played" < now() - interval '30 days');
