import { eq, inArray, sql } from 'drizzle-orm';
import { games, timeToBeat, type Db } from '@perch/db';
import type { IgdbClient, TagQuery } from './client.js';
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
  /** Batched getGame: one DB read, then one batched IGDB fetch for the missing/stale ids. */
  getGames(igdbIds: readonly number[]): Promise<Game[]>;
  /** Runs the tag query on IGDB and upserts every result so later lookups hit the cache. */
  queryByTags(q: TagQuery): Promise<Game[]>;
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

  async function upsertGames(list: Game[]): Promise<void> {
    if (list.length === 0) return;
    const fetchedAt = now();
    // Chunked: Postgres caps bind parameters per statement.
    for (let i = 0; i < list.length; i += 200) {
      const chunk = list.slice(i, i + 200);
      await db
        .insert(games)
        .values(chunk.map((g) => ({ ...g, fetchedAt })))
        .onConflictDoUpdate({
          target: games.igdbId,
          set: {
            name: sql`excluded.name`,
            slug: sql`excluded.slug`,
            coverUrl: sql`excluded.cover_url`,
            firstRelease: sql`excluded.first_release`,
            genres: sql`excluded.genres`,
            themes: sql`excluded.themes`,
            keywords: sql`excluded.keywords`,
            perspectives: sql`excluded.perspectives`,
            gameModes: sql`excluded.game_modes`,
            platforms: sql`excluded.platforms`,
            similarIds: sql`excluded.similar_ids`,
            rating: sql`excluded.rating`,
            ratingCount: sql`excluded.rating_count`,
            steamAppId: sql`excluded.steam_app_id`,
            fetchedAt: sql`excluded.fetched_at`,
          },
        });
    }
  }

  async function getGames(igdbIds: readonly number[]): Promise<Game[]> {
    const ids = [...new Set(igdbIds)];
    if (ids.length === 0) return [];
    const found = new Map<number, Game>();
    for (let i = 0; i < ids.length; i += 1000) {
      const rows = await db
        .select()
        .from(games)
        .where(inArray(games.igdbId, ids.slice(i, i + 1000)));
      for (const row of rows) if (isFresh(row.fetchedAt)) found.set(row.igdbId, toGame(row));
    }
    const missing = ids.filter((id) => !found.has(id));
    const fetched = await client.getGames(missing);
    await upsertGames(fetched);
    for (const g of fetched) found.set(g.igdbId, g);
    return ids.flatMap((id) => found.get(id) ?? []);
  }

  async function queryByTags(q: TagQuery): Promise<Game[]> {
    const result = await client.queryByTags(q);
    await upsertGames(result);
    return result;
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

  return { getGame, getGames, queryByTags, getTimeToBeat };
}
