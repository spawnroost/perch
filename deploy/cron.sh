#!/bin/sh
# Long-running cron container (tools image). All times UTC.
#   CACHE_AT    "HH:MM ..." slots (default every 6 h) for the IGDB backfills: art, facts, time to beat.
#               Each only touches cached games that lack data, so a quiet run is cheap.
#   REFRESH_AT  "HH:MM" on weekday REFRESH_DOW (1=Mon..7=Sun, default 7) for `perch igdb:refresh`,
#               a full refetch of every cached game.
#   BACKUP_AT   "HH:MM" for deploy/backup.sh (default 02:00)
# A failing job is logged and retried at its next slot; it never kills the loop.
set -u
cd /app

CACHE_AT="${CACHE_AT:-00:15 06:15 12:15 18:15}"
REFRESH_AT="${REFRESH_AT:-04:30}"
REFRESH_DOW="${REFRESH_DOW:-7}"
BACKUP_AT="${BACKUP_AT:-02:00}"
last=""

log() { printf '%s cron: %s\n' "$(date -u +%FT%TZ)" "$*"; }
log "started; caches at: ${CACHE_AT}; refresh at: ${REFRESH_AT} (dow ${REFRESH_DOW}); backup at: ${BACKUP_AT}"

while true; do
  now="$(date -u +%H:%M)"
  slot="$(date -u +%F)T${now}"
  if [ "$slot" != "$last" ]; then
    last="$slot"
    for t in $CACHE_AT; do
      if [ "$t" = "$now" ]; then
        for job in igdb:backfill-art igdb:backfill-facts igdb:backfill-ttb; do
          log "$job"
          pnpm --silent perch "$job" || log "$job failed"
        done
      fi
    done
    if [ "$REFRESH_AT" = "$now" ] && [ "$(date -u +%u)" = "$REFRESH_DOW" ]; then
      log "igdb:refresh"
      pnpm --silent perch igdb:refresh || log "igdb:refresh failed"
    fi
    if [ "$BACKUP_AT" = "$now" ]; then
      log "backup"
      sh /app/deploy/backup.sh || log "backup failed"
    fi
  fi
  sleep 20
done
