import { eq } from 'drizzle-orm';
import { games, timeToBeat, type Db } from '@perch/db';
import type { IgdbClient } from './client.js';
import type { Game, TimeToBeat } from './schemas.js';

export const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface IgdbCacheOptions {
  db: Db;
  client: IgdbClient;
  ttlMs?: number;
  now?: () => Date;
}

export interface IgdbCache {
  /** Cache first; fetches and upserts on a miss or a row older than the TTL. */
  getGame(igdbId: number): Promise<Game | null>;
  /** Same for time-to-beat. A game with no IGDB record is cached as an empty row (returns null). */
  getTimeToBeat(igdbId: number): Promise<TimeToBeat | null>;
}

function toGame(row: typeof games.$inferSelect): Game {
  return {
    igdbId: row.igdbId,
    name: row.name,
    slug: row.slug,
    coverUrl: row.coverUrl,
    firstRelease: row.firstRelease,
    genres: row.genres,
    themes: row.themes,
    keywords: row.keywords,
    perspectives: row.perspectives,
    gameModes: row.gameModes,
    platforms: row.platforms,
    similarIds: row.similarIds,
    rating: row.rating,
    ratingCount: row.ratingCount,
    steamAppId: row.steamAppId,
  };
}

export function createIgdbCache(opts: IgdbCacheOptions): IgdbCache {
  const { db, client, ttlMs = CACHE_TTL_MS, now = () => new Date() } = opts;
  const isFresh = (at: Date) => now().getTime() - at.getTime() < ttlMs;

  async function getGame(igdbId: number): Promise<Game | null> {
    const [row] = await db.select().from(games).where(eq(games.igdbId, igdbId));
    if (row && isFresh(row.fetchedAt)) {
      return toGame(row);
    }
    const game = await client.getGame(igdbId);
    if (!game) return null;
    // `vocab` is derived elsewhere; an upsert must not reset it.
    await db
      .insert(games)
      .values({ ...game, fetchedAt: now() })
      .onConflictDoUpdate({ target: games.igdbId, set: { ...game, fetchedAt: now() } });
    return game;
  }

  async function getTimeToBeat(igdbId: number): Promise<TimeToBeat | null> {
    const [row] = await db.select().from(timeToBeat).where(eq(timeToBeat.igdbId, igdbId));
    let value: TimeToBeat | null;
    if (row && isFresh(row.checkedAt)) {
      value = row;
    } else {
      // time_to_beat references games, so make sure the game row exists first.
      if (!(await getGame(igdbId))) return null;
      value = await client.getTimeToBeat(igdbId);
      const cols = {
        hastilySeconds: value?.hastilySeconds ?? null,
        normallySeconds: value?.normallySeconds ?? null,
        completelySeconds: value?.completelySeconds ?? null,
        count: value?.count ?? null,
        checkedAt: now(),
      };
      await db
        .insert(timeToBeat)
        .values({ igdbId, ...cols })
        .onConflictDoUpdate({ target: timeToBeat.igdbId, set: cols });
    }
    if (!value) return null;
    const { hastilySeconds, normallySeconds, completelySeconds, count } = value;
    if ([hastilySeconds, normallySeconds, completelySeconds, count].every((v) => v === null)) {
      return null;
    }
    return { hastilySeconds, normallySeconds, completelySeconds, count };
  }

  return { getGame, getTimeToBeat };
}
