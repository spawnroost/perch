import { eq } from 'drizzle-orm';
import { games, type Db } from '@perch/db';
import { getSharedSteamClient, type SteamClient } from '../requirements/steam.js';
import type { SteamReviews } from './summary.js';

export { parseReviewSummary } from './summary.js';
export type { SteamReviews } from './summary.js';

export const STEAM_REVIEWS_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** A failed fetch is not retried for this long. */
const FAILURE_RETRY_MS = 6 * 60 * 60 * 1000;
/** How long a game page waits for a first fetch before answering without reviews. */
const DEFAULT_WAIT_MS = 1500;

export interface SteamReviewsOptions {
  client?: SteamClient;
  ttlMs?: number;
  now?: () => Date;
  /** Longest a call waits for a fetch it started; the fetch continues in the background. */
  waitMs?: number;
}

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
const inflight = new Map<number, Promise<SteamReviews | null>>();

/** Resolves when every fetch started here has settled (tests, shutdown). */
export async function steamReviewsIdle(): Promise<void> {
  while (inflight.size > 0) await Promise.allSettled([...inflight.values()]);
}

type Stored = NonNullable<Awaited<ReturnType<typeof loadSteamReviews>>>;

/** Fetches and stores the summary; resolves to it, or to the stored one when Steam fails. */
async function refresh(
  db: Db,
  game: { igdbId: number; steamAppId: number },
  stored: Stored,
  opts: SteamReviewsOptions,
): Promise<SteamReviews | null> {
  const { ttlMs = STEAM_REVIEWS_TTL_MS, now = () => new Date() } = opts;
  const client = opts.client ?? getSharedSteamClient();
  let summary: SteamReviews | null;
  try {
    summary = await client.getReviewSummary(game.steamAppId);
  } catch (err) {
    console.warn(`steam reviews for app ${game.steamAppId} failed:`, err);
    // Negative cache: back-date the stamp so the row counts as fresh for FAILURE_RETRY_MS only.
    await db
      .update(games)
      .set({ steamReviewFetchedAt: new Date(now().getTime() - ttlMs + FAILURE_RETRY_MS) })
      .where(eq(games.igdbId, game.igdbId));
    return stored.reviews;
  }
  await db
    .update(games)
    .set({
      steamReviewDesc: summary?.desc ?? null,
      steamReviewPct: summary?.pct ?? null,
      steamReviewTotal: summary?.total ?? null,
      steamReviewFetchedAt: now(),
    })
    .where(eq(games.igdbId, game.igdbId));
  return summary;
}

/**
 * Steam review summary for a game, from the games row. A summary past the TTL is served at once
 * and refreshed in the background; with nothing stored the call waits up to `waitMs` for the
 * first fetch (through the Steam client's rate queue), which otherwise finishes in the
 * background. Never throws: any failure gives the stored summary, else null. Null also when the
 * game has no Steam app or no reviews.
 */
export async function steamReviewsFor(
  db: Db,
  game: { igdbId: number; steamAppId: number | null },
  opts: SteamReviewsOptions = {},
): Promise<SteamReviews | null> {
  const { steamAppId } = game;
  if (!steamAppId) return null;
  const { ttlMs = STEAM_REVIEWS_TTL_MS, now = () => new Date() } = opts;
  try {
    const stored = await loadSteamReviews(db, game.igdbId);
    if (!stored) return null;
    if (stored.fetchedAt && now().getTime() - stored.fetchedAt.getTime() < ttlMs) {
      return stored.reviews;
    }
    let p = inflight.get(game.igdbId);
    if (!p) {
      const started: Promise<SteamReviews | null> = refresh(
        db,
        { igdbId: game.igdbId, steamAppId },
        stored,
        opts,
      )
        .catch((err) => {
          console.warn(`steam reviews for app ${steamAppId} not stored:`, err);
          return stored.reviews;
        })
        .finally(() => inflight.delete(game.igdbId));
      inflight.set(game.igdbId, started);
      p = started;
    }
    if (stored.reviews) return stored.reviews;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const waited = await Promise.race([
      p,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), opts.waitMs ?? DEFAULT_WAIT_MS);
      }),
    ]);
    clearTimeout(timer);
    return waited;
  } catch (err) {
    console.warn(`steam reviews for app ${steamAppId} unavailable:`, err);
    return null;
  }
}
