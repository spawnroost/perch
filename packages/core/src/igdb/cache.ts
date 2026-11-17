import { eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { games, timeToBeat, type Db } from '@perch/db';
import type { IgdbClient, TagQuery } from './client.js';
import type { Game, TimeToBeat } from './schemas.js';

export const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface IgdbCacheOptions {
  db: Db;
  client: IgdbClient;
  ttlMs?: number;
  now?: () => Date;
  /** Taste-vocab mapper; when set, every upsert writes freshly computed `games.vocab`. */
  mapVocab?: (game: Game) => Record<string, number>;
  /** Cover image URL -> accent hex (null on failure). When set, upserts compute `games.accent`. */
  accentFor?: (coverUrl: string) => Promise<string | null>;
}

const ACCENT_CONCURRENCY = 8;

export interface IgdbCache {
  /** Cache first; fetches and upserts on a miss or a row older than the TTL. */
  getGame(igdbId: number): Promise<Game | null>;
  /** Batched getGame: one DB read, then one batched IGDB fetch for the missing/stale ids. */
  getGames(igdbIds: readonly number[]): Promise<Game[]>;
  /** Runs the tag query on IGDB and upserts every result so later lookups hit the cache. */
  queryByTags(q: TagQuery): Promise<Game[]>;
  /** Refetches every cached game by id and upserts it. Also lists ids IGDB did not return. */
  refreshAll(): Promise<{ refreshed: number; missing: number[] }>;
  /** Refetches only cached games missing a hero or accent and fills them. */
  backfillArt(): Promise<{ checked: number; updated: number }>;
  /** Same for time-to-beat. A game with no IGDB record is cached as an empty row (returns null). */
  getTimeToBeat(igdbId: number): Promise<TimeToBeat | null>;
}

function toGame(row: typeof games.$inferSelect): Game {
  return {
    igdbId: row.igdbId,
    name: row.name,
    slug: row.slug,
    coverUrl: row.coverUrl,
    coverUrlSmall: row.coverUrlSmall,
    heroUrl: row.heroUrl,
    accent: row.accent,
    summary: row.summary,
    firstRelease: row.firstRelease,
    genres: row.genres,
    themes: row.themes,
    keywords: row.keywords,
    perspectives: row.perspectives,
    gameModes: row.gameModes,
    platforms: row.platforms,
    similarIds: row.similarIds,
    series: row.series,
    rating: row.rating,
    ratingCount: row.ratingCount,
    steamAppId: row.steamAppId,
  };
}

export function createIgdbCache(opts: IgdbCacheOptions): IgdbCache {
  const { db, client, ttlMs = CACHE_TTL_MS, now = () => new Date(), mapVocab, accentFor } = opts;
  const isFresh = (at: Date) => now().getTime() - at.getTime() < ttlMs;

  async function getGame(igdbId: number): Promise<Game | null> {
    const [row] = await db.select().from(games).where(eq(games.igdbId, igdbId));
    if (row && isFresh(row.fetchedAt)) {
      return toGame(row);
    }
    const game = await client.getGame(igdbId);
    if (!game) return null;
    const [saved] = await upsertGames([game]);
    return saved ?? game;
  }

  /** Fills `accent` from the cover; a known cover keeps its accent, a failure leaves it null. */
  async function withAccents(list: Game[]): Promise<Game[]> {
    if (!accentFor || list.length === 0) return list;
    const known = new Map<number, { coverUrl: string | null; accent: string | null }>();
    for (let i = 0; i < list.length; i += 1000) {
      const rows = await db
        .select({ id: games.igdbId, coverUrl: games.coverUrl, accent: games.accent })
        .from(games)
        .where(
          inArray(
            games.igdbId,
            list.slice(i, i + 1000).map((g) => g.igdbId),
          ),
        );
      for (const r of rows) known.set(r.id, r);
    }
    const out = [...list];
    let next = 0;
    const worker = async () => {
      while (next < out.length) {
        const i = next++;
        const g = out[i]!;
        const prev = known.get(g.igdbId);
        if (prev?.accent && prev.coverUrl === g.coverUrl) {
          out[i] = { ...g, accent: prev.accent };
        } else if (g.coverUrlSmall) {
          out[i] = {
            ...g,
            accent: (await accentFor(g.coverUrlSmall).catch(() => null)) ?? g.accent,
          };
        }
      }
    };
    await Promise.all(Array.from({ length: ACCENT_CONCURRENCY }, worker));
    return out;
  }

  /** Upserts the games (accent computed when configured) and returns them as stored. */
  async function upsertGames(input: Game[]): Promise<Game[]> {
    if (input.length === 0) return [];
    const enriched = await withAccents(input);
    const fetchedAt = now();
    // Sorted so concurrent upserts lock rows in the same order.
    const list = [...enriched].sort((a, b) => a.igdbId - b.igdbId);
    // Chunked: Postgres caps bind parameters per statement.
    for (let i = 0; i < list.length; i += 200) {
      const chunk = list.slice(i, i + 200);
      await db
        .insert(games)
        .values(
          chunk.map((g) => ({ ...g, fetchedAt, ...(mapVocab ? { vocab: mapVocab(g) } : {}) })),
        )
        .onConflictDoUpdate({
          target: games.igdbId,
          set: {
            name: sql`excluded.name`,
            slug: sql`excluded.slug`,
            coverUrl: sql`excluded.cover_url`,
            coverUrlSmall: sql`excluded.cover_url_small`,
            heroUrl: sql`excluded.hero_url`,
            // A lookup that failed (null) must not erase a colour we already have.
            accent: sql`coalesce(excluded.accent, ${games.accent})`,
            summary: sql`excluded.summary`,
            firstRelease: sql`excluded.first_release`,
            genres: sql`excluded.genres`,
            themes: sql`excluded.themes`,
            keywords: sql`excluded.keywords`,
            perspectives: sql`excluded.perspectives`,
            gameModes: sql`excluded.game_modes`,
            platforms: sql`excluded.platforms`,
            similarIds: sql`excluded.similar_ids`,
            series: sql`excluded.series`,
            rating: sql`excluded.rating`,
            ratingCount: sql`excluded.rating_count`,
            steamAppId: sql`excluded.steam_app_id`,
            fetchedAt: sql`excluded.fetched_at`,
            // Without a mapper, vocab is derived elsewhere and an upsert must not reset it.
            ...(mapVocab ? { vocab: sql`excluded.vocab` } : {}),
          },
        });
    }
    return enriched; // input order, which callers (queryByTags) rely on
  }

  async function getGames(igdbIds: readonly number[]): Promise<Game[]> {
    const ids = [...new Set(igdbIds)];
    if (ids.length === 0) return [];
    const found = new Map<number, Game>();
    const stale = new Map<number, Game>();
    for (let i = 0; i < ids.length; i += 1000) {
      const rows = await db
        .select()
        .from(games)
        .where(inArray(games.igdbId, ids.slice(i, i + 1000)));
      for (const row of rows) {
        (isFresh(row.fetchedAt) ? found : stale).set(row.igdbId, toGame(row));
      }
    }
    const missing = ids.filter((id) => !found.has(id));
    if (missing.length > 0) {
      let fetched: Game[];
      try {
        fetched = await upsertGames(await client.getGames(missing));
      } catch (e) {
        // A failed refetch is fine only if every missing id has a stale row to serve instead.
        if (missing.some((id) => !stale.has(id))) throw e;
        fetched = [];
      }
      for (const g of fetched) found.set(g.igdbId, g);
    }
    // IGDB missed it or the refetch failed: a stale row beats nothing.
    return ids.flatMap((id) => found.get(id) ?? stale.get(id) ?? []);
  }

  async function queryByTags(q: TagQuery): Promise<Game[]> {
    return upsertGames(await client.queryByTags(q));
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

  async function refreshAll(): Promise<{ refreshed: number; missing: number[] }> {
    const rows = await db.select({ id: games.igdbId }).from(games).orderBy(games.igdbId);
    // client.getGames batches the ids itself.
    const fetched = await upsertGames(await client.getGames(rows.map((r) => r.id)));
    const got = new Set(fetched.map((g) => g.igdbId));
    return {
      refreshed: fetched.length,
      missing: rows.map((r) => r.id).filter((id) => !got.has(id)),
    };
  }

  async function backfillArt(): Promise<{ checked: number; updated: number }> {
    const rows = await db
      .select({ id: games.igdbId })
      .from(games)
      .where(or(isNull(games.heroUrl), isNull(games.accent)))
      .orderBy(games.igdbId);
    const fetched = await upsertGames(await client.getGames(rows.map((r) => r.id)));
    return { checked: rows.length, updated: fetched.filter((g) => g.heroUrl || g.accent).length };
  }

  return { getGame, getGames, queryByTags, refreshAll, backfillArt, getTimeToBeat };
}
