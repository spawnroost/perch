import { eq } from 'drizzle-orm';
import { games, type Db } from '@perch/db';
import { createSteamClient, type SteamClient } from '../requirements/steam.js';
import type { SteamReviews } from './summary.js';

export { parseReviewSummary } from './summary.js';
export type { SteamReviews } from './summary.js';

export const STEAM_REVIEWS_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** How long a game page waits for a first fetch before answering without reviews. */
const DEFAULT_WAIT_MS = 1500;

export interface SteamReviewsOptions {
  client?: SteamClient;
  ttlMs?: number;
  now?: () => Date;
  /** Longest a call waits for a fetch it started; the fetch continues in the background. */
  waitMs?: number;
}

let sharedClient: SteamClient | undefined;

/** The stored summary and when it was fetched; null when the game row does not exist. */
export async function loadSteamReviews(
  db: Db,
  igdbId: number,
): Promise<{ reviews: SteamReviews | null; fetchedAt: Date | null } | null> {
  const [row] = await db
    .select({
      desc: games.steamReviewDesc,
      pct: games.steamReviewPct,
      total: games.steamReviewTotal,
      fetchedAt: games.steamReviewFetchedAt,
    })
    .from(games)
    .where(eq(games.igdbId, igdbId));
  if (!row) return null;
  const reviews =
    row.desc !== null && row.pct !== null && row.total !== null
      ? { desc: row.desc, pct: row.pct, total: row.total }
      : null;
  return { reviews, fetchedAt: row.fetchedAt };
}

/** Fetches still running, one per game, so overlapping requests share them. */
const inflight = new Map<number, Promise<void>>();

/** Resolves when every fetch started here has settled (tests, shutdown). */
export async function steamReviewsIdle(): Promise<void> {
  while (inflight.size > 0) await Promise.allSettled([...inflight.values()]);
}

async function refresh(
  db: Db,
  game: { igdbId: number; steamAppId: number },
  opts: SteamReviewsOptions,
): Promise<void> {
  const { ttlMs = STEAM_REVIEWS_TTL_MS, now = () => new Date() } = opts;
  const stored = await loadSteamReviews(db, game.igdbId);
  if (!stored) return;
  if (stored.fetchedAt && now().getTime() - stored.fetchedAt.getTime() < ttlMs) return;
  const client = opts.client ?? (sharedClient ??= createSteamClient());
  const summary = await client.getReviewSummary(game.steamAppId);
  await db
    .update(games)
    .set({
      steamReviewDesc: summary?.desc ?? null,
      steamReviewPct: summary?.pct ?? null,
      steamReviewTotal: summary?.total ?? null,
      steamReviewFetchedAt: now(),
    })
    .where(eq(games.igdbId, game.igdbId));
}

/**
 * Steam review summary for a game, from the games row. A missing or older-than-TTL summary is
 * fetched (through the Steam client's rate queue) and the call waits up to `waitMs` for it; a
 * slower fetch finishes in the background and shows on the next call. Failures are swallowed and
 * leave the stale summary in place. Null when the game has no Steam app or no reviews.
 */
export async function steamReviewsFor(
  db: Db,
  game: { igdbId: number; steamAppId: number | null },
  opts: SteamReviewsOptions = {},
): Promise<SteamReviews | null> {
  const { steamAppId } = game;
  if (!steamAppId) return null;
  let p = inflight.get(game.igdbId);
  if (!p) {
    const started: Promise<void> = refresh(db, { igdbId: game.igdbId, steamAppId }, opts)
      .catch(() => {})
      .finally(() => inflight.delete(game.igdbId));
    inflight.set(game.igdbId, started);
    p = started;
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    p,
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, opts.waitMs ?? DEFAULT_WAIT_MS);
    }),
  ]);
  clearTimeout(timer);
  return (await loadSteamReviews(db, game.igdbId))?.reviews ?? null;
}
