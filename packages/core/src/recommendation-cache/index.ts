/** How long a cached recommendation set is served without recomputing. */
export const RECOMMENDATION_CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000;

/**
 * Cache key for a recommendations request. Only a missing device is folded into 'all' (that is
 * what `selectDevices` does); ids and kinds stay case-sensitive, as there.
 */
export function recommendationCacheKey(params: { device?: string; limit: number }): string {
  return `device=${params.device ?? 'all'};limit=${params.limit}`;
}

export function isFresh(
  computedAt: Date,
  now: Date,
  maxAgeMs: number = RECOMMENDATION_CACHE_MAX_AGE_MS,
): boolean {
  return now.getTime() - computedAt.getTime() < maxAgeMs;
}

/** Cover accents and time-to-beat fill in shortly after the first compute; hold such results briefly. */
export const PROVISIONAL_MAX_AGE_MS = 30 * 1000;

interface SettleCheck {
  game: { coverUrl: string | null; accent: string | null };
  timeToBeat: unknown | null;
}

/**
 * True when nothing is still being fetched in the background: every pick with a cover has its
 * accent and, if `requireTimeToBeat`, every pick has time-to-beat. (A game may never have
 * time-to-beat, so only the first compute after an invalidation waits for it.)
 */
export function isSettled(picks: SettleCheck[], opts: { requireTimeToBeat: boolean }): boolean {
  return picks.every(
    (p) =>
      (p.game.coverUrl === null || p.game.accent !== null) &&
      (!opts.requireTimeToBeat || p.timeToBeat !== null),
  );
}

/** The `computedAt` to store: unsettled results are backdated so they expire after ~30 s. */
export function computedAtFor(now: Date, settled: boolean): Date {
  return settled
    ? now
    : new Date(now.getTime() - (RECOMMENDATION_CACHE_MAX_AGE_MS - PROVISIONAL_MAX_AGE_MS));
}
export * from './version.js';
