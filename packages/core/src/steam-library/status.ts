import type { Status } from '../library/fields.js';

const RECENT_MS = 30 * 86_400_000;
export const AUTO_SYNC_INTERVAL_MS = 6 * 3_600_000;

/**
 * Status for a newly imported Steam game: played in the last 30 days is playing, anything else
 * backlog. Steam cannot tell finished from abandoned, so that is left to the user. Pass no
 * `minutes` when playtime is unknown (Xbox): last-played alone decides.
 */
export function steamImportStatus({
  minutes,
  lastPlayed,
  now,
}: {
  minutes?: number;
  lastPlayed: Date | null;
  now: Date;
}): Status {
  if (
    (minutes === undefined || minutes > 0) &&
    lastPlayed &&
    now.getTime() - lastPlayed.getTime() <= RECENT_MS
  )
    return 'playing';
  return 'backlog';
}

/** True when the last sync is missing or at least 6 hours old (or `intervalMs`). */
export function shouldAutoSync(
  syncedAt: Date | null,
  now: Date,
  intervalMs = AUTO_SYNC_INTERVAL_MS,
): boolean {
  return !syncedAt || now.getTime() - syncedAt.getTime() >= intervalMs;
}
