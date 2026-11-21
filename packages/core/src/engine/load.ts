import { eq } from 'drizzle-orm';
import { devices, feedback, games, libraryEntries, type Db } from '@perch/db';
import { getDeckCategory, peekDeckCategory } from '../deck/index.js';
import { getRequirements, peekRequirements, type SteamClient } from '../requirements/steam.js';
import {
  deviceKind,
  platformMatches,
  type DeckCategory,
  type FilterDevice,
  type FitRequirements,
} from './filters.js';
import type { Status } from '../library/fields.js';
import type { FeedbackItem, LibraryItem, Vocab } from './types.js';

/**
 * Loads a user's library (joined with games) and feedback. Vocab is always computed fresh with
 * `mapVocab`, so a vocab table change never leaves library games on stale stored vectors.
 */
export async function loadRecommendInput(
  db: Db,
  userId: string,
  mapVocab: (game: typeof games.$inferSelect) => Vocab,
): Promise<{ library: LibraryItem[]; feedback: FeedbackItem[] }> {
  const rows = await db
    .select({ entry: libraryEntries, game: games })
    .from(libraryEntries)
    .innerJoin(games, eq(games.igdbId, libraryEntries.igdbId))
    .where(eq(libraryEntries.userId, userId));
  const fb = await db
    .select({ igdbId: feedback.igdbId, kind: feedback.kind })
    .from(feedback)
    .where(eq(feedback.userId, userId));
  return {
    library: rows.map(({ entry, game }) => ({
      game: {
        igdbId: game.igdbId,
        name: game.name,
        firstRelease: game.firstRelease,
        genres: game.genres,
        themes: game.themes,
        similarIds: game.similarIds,
        series: game.series,
        rating: game.rating,
        ratingCount: game.ratingCount,
        platforms: game.platforms,
        steamAppId: game.steamAppId,
        vocab: mapVocab(game),
      },
      hours: entry.hoursPlayed,
      lastPlayed: entry.lastPlayed,
      status: entry.status as Status,
      owned: entry.owned,
      rating: entry.rating,
      platform: entry.platform,
    })),
    feedback: fb.map((f) => ({ igdbId: f.igdbId, kind: f.kind as FeedbackItem['kind'] })),
  };
}

/** A user's devices; the default one first. */
export async function loadDevices(
  db: Db,
  userId: string,
): Promise<(FilterDevice & { name: string })[]> {
  const rows = await db.select().from(devices).where(eq(devices.userId, userId));
  return rows
    .sort((a, b) => Number(b.isDefault) - Number(a.isDefault))
    .map((d) => ({
      id: d.id,
      name: d.name,
      kind: d.kind,
      platformIds: d.platformIds,
      gpuScore: d.gpuScore,
      cpuScore: d.cpuScore,
      ramGb: d.ramGb,
    }));
}

/** DB-backed (cached, Steam-rate-limited) fetchers for `RecommendDeps`. */
export function createFitFetchers(
  db: Db,
  steam?: SteamClient,
): {
  fetchRequirements(game: { igdbId: number }): Promise<FitRequirements | null>;
  fetchDeck(steamAppId: number): Promise<DeckCategory>;
} {
  return {
    fetchRequirements: (game) => getRequirements(db, game.igdbId, { client: steam }),
    fetchDeck: (steamAppId) => getDeckCategory(db, steamAppId, { client: steam }),
  };
}

/** Fit fetchers that only read what is already cached (any age): no Steam request, ever. */
export function createCachedFitFetchers(db: Db): ReturnType<typeof createFitFetchers> {
  return {
    fetchRequirements: (game) => peekRequirements(db, game.igdbId),
    fetchDeck: (steamAppId) => peekDeckCategory(db, steamAppId),
  };
}

/** Games a background fit warm is already working on, so overlapping spins don't queue them twice. */
const warming = new Set<number>();

/**
 * Fills the Steam requirements / Deck cache for `games` in the background, one game at a time
 * (the Steam client rate limits anyway), at most `max` games. Only fetches what `devices` need,
 * and only what is missing or stale. Returns at once; failures are ignored (fit stays unknown).
 */
export function warmFitCache(
  db: Db,
  steam: SteamClient | undefined,
  games: readonly { igdbId: number; platforms?: readonly number[]; steamAppId?: number | null }[],
  devices: readonly FilterDevice[],
  max: number,
): void {
  const todo = games.filter((g) => g.steamAppId != null && !warming.has(g.igdbId)).slice(0, max);
  for (const g of todo) warming.add(g.igdbId);
  void (async () => {
    for (const g of todo) {
      try {
        const live = devices.filter((d) => platformMatches(g, d));
        if (live.some((d) => deviceKind(d) === 'pc')) {
          await getRequirements(db, g.igdbId, { client: steam }).catch(() => null);
        }
        if (live.some((d) => deviceKind(d) === 'deck')) {
          await getDeckCategory(db, g.steamAppId!, { client: steam }).catch(() => null);
        }
      } finally {
        warming.delete(g.igdbId);
      }
    }
  })();
}
