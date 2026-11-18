import { and, eq, inArray, isNotNull, isNull, ne, or, sql } from 'drizzle-orm';
import { games, timeToBeat, type Db } from '@perch/db';
import { createTtlMemo } from '../browse/ttl-memo.js';
import type { IgdbClient, TagQuery } from './client.js';
import { sharedAccentQueue, type AccentQueue } from './accent.js';
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
  /** Limits and dedupes the downloads; defaults to the process-wide queue. */
  accentQueue?: AccentQueue;
}

export interface IgdbCache {
  /** Cache first; fetches and upserts on a miss or a row older than the TTL. */
  getGame(igdbId: number): Promise<Game | null>;
  /** Batched getGame: one DB read, then one batched IGDB fetch for the missing/stale ids. */
  getGames(igdbIds: readonly number[]): Promise<Game[]>;
  /** Runs the tag query on IGDB and upserts every result so later lookups hit the cache. */
  queryByTags(q: TagQuery): Promise<Game[]>;
  /** Refetches every cached game by id and upserts it. Also lists ids IGDB did not return. */
  refreshAll(): Promise<{ refreshed: number; missing: number[] }>;
  /**
   * Fetches art for cached games never checked for it and computes missing accents, waiting for
   * the downloads. `updated` counts rows whose hero or accent actually changed.
   */
  backfillArt(): Promise<{ checked: number; updated: number }>;
  /**
   * Refetches, in batches, the cached games whose About fields were never fetched and upserts
   * them; games IGDB no longer returns are stamped so they are not retried. `updated` counts the
   * games that now have any of the facts.
   */
  backfillFacts(): Promise<{ checked: number; updated: number }>;
  /** Resolves when all background work (accent downloads, time-to-beat warm-ups) has finished. */
  idle(): Promise<void>;
  /** Same for time-to-beat. A game with no IGDB record is cached as an empty row (returns null). */
  getTimeToBeat(igdbId: number): Promise<TimeToBeat | null>;
  /**
   * Fetches time-to-beat for the games with no row or a stale one (the IGDB client rate-limits
   * the calls). Ids already being fetched are not queued again. The promise never rejects and
   * settles when every id is done: ignore it to fire and forget, or race it with a timeout.
   * Errors are swallowed; `idle` waits for it too.
   */
  warmTimeToBeat(igdbIds: readonly number[]): Promise<void>;
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
    criticRating: row.criticRating,
    criticRatingCount: row.criticRatingCount,
    websites: row.websites,
    developers: row.developers,
    publishers: row.publishers,
    multiplayer: row.multiplayer,
    dlcCount: row.dlcCount,
    expansionCount: row.expansionCount,
    seriesName: row.seriesName,
  };
}

/** Runs `query` over id batches (Postgres caps bind parameters) and concatenates the rows. */
async function inBatches<T>(
  ids: readonly number[],
  query: (batch: number[]) => Promise<T[]>,
  size = 1000,
): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += size) out.push(...(await query(ids.slice(i, i + size))));
  return out;
}

const hasFacts = (g: Game) =>
  g.criticRating !== null ||
  g.websites.length > 0 ||
  g.developers.length > 0 ||
  g.multiplayer !== null ||
  g.dlcCount + g.expansionCount > 0 ||
  g.seriesName !== null;

/** The game without its About fields (see `upsertGames`). */
function withoutAbout(game: Game) {
  const { developers, publishers, multiplayer, dlcCount, expansionCount, seriesName, ...rest } =
    game;
  void [developers, publishers, multiplayer, dlcCount, expansionCount, seriesName];
  return rest;
}

export function createIgdbCache(opts: IgdbCacheOptions): IgdbCache {
  const { db, client, ttlMs = CACHE_TTL_MS, now = () => new Date(), mapVocab, accentFor } = opts;
  const accentQueue = opts.accentQueue ?? sharedAccentQueue;
  const isFresh = (at: Date) => now().getTime() - at.getTime() < ttlMs;

  async function getGame(igdbId: number): Promise<Game | null> {
    const [row] = await db.select().from(games).where(eq(games.igdbId, igdbId));
    // A row from a lean (candidate) fetch has no About fields yet: fetch it in full.
    if (row && row.aboutFetchedAt && isFresh(row.fetchedAt)) {
      return toGame(row);
    }
    const game = await client.getGame(igdbId);
    if (!game) return null;
    const [saved] = await upsertGames([game], { about: true });
    return saved ?? game;
  }

  /** Accent downloads still running in the background (see `idle`). */
  const pending = new Set<Promise<void>>();

  /** Downloads and stores accents without blocking the caller; errors are swallowed. */
  function fillAccents(todo: Array<{ igdbId: number; url: string }>): void {
    if (!accentFor) return;
    for (const { igdbId, url } of todo) {
      const p: Promise<void> = accentQueue
        .run(url, accentFor)
        .then(async (accent) => {
          // Only if the cover has not changed again while we were downloading.
          await db
            .update(games)
            .set({ accent, accentSource: url })
            .where(and(eq(games.igdbId, igdbId), eq(games.coverUrlSmall, url)));
        })
        .catch(() => {})
        .finally(() => pending.delete(p));
      pending.add(p);
    }
  }

  async function idle(): Promise<void> {
    while (pending.size > 0) await Promise.allSettled([...pending]);
  }

  /**
   * Upserts the games and returns them as stored, in input order. The accent is never computed
   * here: a row keeps its accent while its small cover is unchanged, otherwise it is cleared and
   * queued for the background filler. Games from a lean fetch (`about: false`) never touch the
   * About columns or their stamp, so details already stored survive a candidate refresh.
   */
  async function upsertGames(input: Game[], { about = false } = {}): Promise<Game[]> {
    if (input.length === 0) return [];
    const fetchedAt = now();
    const storedAccent = new Map<number, string | null>();
    const todo: Array<{ igdbId: number; url: string }> = [];
    // Sorted so concurrent upserts lock rows in the same order.
    const list = [...input].sort((a, b) => a.igdbId - b.igdbId);
    // Chunked: Postgres caps bind parameters per statement.
    for (let i = 0; i < list.length; i += 200) {
      const chunk = list.slice(i, i + 200);
      const rows = await db
        .insert(games)
        .values(
          chunk.map((g) => ({
            ...(about ? g : withoutAbout(g)),
            accent: null,
            accentSource: null,
            artCheckedAt: fetchedAt,
            ...(about ? { aboutFetchedAt: fetchedAt } : {}),
            fetchedAt,
            ...(mapVocab ? { vocab: mapVocab(g) } : {}),
          })),
        )
        .onConflictDoUpdate({
          target: games.igdbId,
          set: {
            name: sql`excluded.name`,
            slug: sql`excluded.slug`,
            coverUrl: sql`excluded.cover_url`,
            coverUrlSmall: sql`excluded.cover_url_small`,
            heroUrl: sql`excluded.hero_url`,
            // Keep the colour only while it was computed from the cover we still have.
            accent: sql`case when ${games.accentSource} = excluded.cover_url_small then ${games.accent} end`,
            accentSource: sql`case when ${games.accentSource} = excluded.cover_url_small then ${games.accentSource} end`,
            artCheckedAt: sql`excluded.art_checked_at`,
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
            criticRating: sql`excluded.critic_rating`,
            criticRatingCount: sql`excluded.critic_rating_count`,
            websites: sql`excluded.websites`,
            ...(about
              ? {
                  developers: sql`excluded.developers`,
                  publishers: sql`excluded.publishers`,
                  multiplayer: sql`excluded.multiplayer`,
                  dlcCount: sql`excluded.dlc_count`,
                  expansionCount: sql`excluded.expansion_count`,
                  seriesName: sql`excluded.series_name`,
                  aboutFetchedAt: sql`excluded.about_fetched_at`,
                }
              : {}),
            fetchedAt: sql`excluded.fetched_at`,
            // Without a mapper, vocab is derived elsewhere and an upsert must not reset it.
            ...(mapVocab ? { vocab: sql`excluded.vocab` } : {}),
          },
        })
        .returning({
          igdbId: games.igdbId,
          accent: games.accent,
          accentSource: games.accentSource,
          coverUrlSmall: games.coverUrlSmall,
        });
      for (const r of rows) {
        storedAccent.set(r.igdbId, r.accent);
        if (r.coverUrlSmall && r.accentSource !== r.coverUrlSmall) {
          todo.push({ igdbId: r.igdbId, url: r.coverUrlSmall });
        }
      }
    }
    fillAccents(todo);
    return input.map((g) => ({ ...g, accent: storedAccent.get(g.igdbId) ?? null }));
  }

  async function getGames(igdbIds: readonly number[]): Promise<Game[]> {
    const ids = [...new Set(igdbIds)];
    if (ids.length === 0) return [];
    const found = new Map<number, Game>();
    const stale = new Map<number, Game>();
    const rows = await inBatches(ids, (batch) =>
      db.select().from(games).where(inArray(games.igdbId, batch)),
    );
    for (const row of rows) {
      (isFresh(row.fetchedAt) ? found : stale).set(row.igdbId, toGame(row));
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

  /** Pools of games per tag set, for 10 minutes: pages, chip toggles and feeds share one IGDB query. */
  const tagPools = createTtlMemo<Game[]>({ now: () => now().getTime() });
  const tagIds = (list: readonly number[]) => [...list].sort((a, b) => a - b).join(',');

  async function queryByTags(q: TagQuery): Promise<Game[]> {
    const key = `${tagIds(q.genres)}|${tagIds(q.themes)}|${q.match ?? 'any'}|${q.minRatingCount}|${q.limit}`;
    return tagPools.get(key, async () => upsertGames(await client.queryByTags(q)));
  }

  /** Fetches and stores one game's time-to-beat; null when the game is unknown or has none. */
  async function refreshTimeToBeat(igdbId: number): Promise<TimeToBeat | null> {
    // time_to_beat references games, so make sure the game row exists first.
    if (!(await getGame(igdbId))) return null;
    const value = await client.getTimeToBeat(igdbId);
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
    return value;
  }

  async function getTimeToBeat(igdbId: number): Promise<TimeToBeat | null> {
    const [row] = await db.select().from(timeToBeat).where(eq(timeToBeat.igdbId, igdbId));
    const value = row && isFresh(row.checkedAt) ? row : await refreshTimeToBeat(igdbId);
    if (!value) return null;
    const { hastilySeconds, normallySeconds, completelySeconds, count } = value;
    if ([hastilySeconds, normallySeconds, completelySeconds, count].every((v) => v === null)) {
      return null;
    }
    return { hastilySeconds, normallySeconds, completelySeconds, count };
  }

  /** Ids whose time-to-beat is being warmed, so overlapping requests do not refetch them. */
  const warming = new Map<number, Promise<void>>();

  function warmTimeToBeat(igdbIds: readonly number[]): Promise<void> {
    const ids = [...new Set(igdbIds)];
    const todo = ids.filter((id) => !warming.has(id));
    const waits = ids.flatMap((id) => warming.get(id) ?? []);
    if (todo.length > 0) {
      const p: Promise<void> = (async () => {
        const rows = await db
          .select({ igdbId: timeToBeat.igdbId, checkedAt: timeToBeat.checkedAt })
          .from(timeToBeat)
          .where(inArray(timeToBeat.igdbId, todo));
        const fresh = new Set(rows.filter((r) => isFresh(r.checkedAt)).map((r) => r.igdbId));
        for (const id of todo) {
          if (!fresh.has(id)) await refreshTimeToBeat(id).catch(() => {});
        }
      })()
        .catch(() => {})
        .finally(() => {
          pending.delete(p);
          for (const id of todo) warming.delete(id);
        });
      pending.add(p);
      for (const id of todo) warming.set(id, p);
      waits.push(p);
    }
    return Promise.all(waits).then(() => {});
  }

  async function refreshAll(): Promise<{ refreshed: number; missing: number[] }> {
    const rows = await db.select({ id: games.igdbId }).from(games).orderBy(games.igdbId);
    // client.getGames batches the ids itself.
    const fetched = await upsertGames(
      await client.getGames(
        rows.map((r) => r.id),
        { full: true },
      ),
      { about: true },
    );
    const got = new Set(fetched.map((g) => g.igdbId));
    return {
      refreshed: fetched.length,
      missing: rows.map((r) => r.id).filter((id) => !got.has(id)),
    };
  }

  /** Games per IGDB fetch + upsert in `backfillFacts`, so progress is kept and memory stays bounded. */
  const BACKFILL_BATCH = 100;

  async function backfillFacts(): Promise<{ checked: number; updated: number }> {
    const rows = await db
      .select({ id: games.igdbId })
      .from(games)
      .where(isNull(games.aboutFetchedAt))
      .orderBy(games.igdbId);
    let updated = 0;
    for (let i = 0; i < rows.length; i += BACKFILL_BATCH) {
      const ids = rows.slice(i, i + BACKFILL_BATCH).map((r) => r.id);
      const fetched = await upsertGames(await client.getGames(ids, { full: true }), {
        about: true,
      });
      // Games IGDB no longer returns are stamped too, so they are not asked again.
      await db
        .update(games)
        .set({ aboutFetchedAt: now() })
        .where(and(inArray(games.igdbId, ids), isNull(games.aboutFetchedAt)));
      updated += fetched.filter(hasFacts).length;
    }
    return { checked: rows.length, updated };
  }

  async function backfillArt(): Promise<{ checked: number; updated: number }> {
    const snapshot = async (ids: number[]) => {
      const rows = await inBatches(ids, (batch) =>
        db
          .select({ id: games.igdbId, hero: games.heroUrl, accent: games.accent })
          .from(games)
          .where(inArray(games.igdbId, batch)),
      );
      return new Map(rows.map((r) => [r.id, `${r.hero}|${r.accent}`]));
    };
    const [unchecked, needAccent] = await Promise.all([
      db
        .select({ id: games.igdbId })
        .from(games)
        .where(isNull(games.artCheckedAt))
        .orderBy(games.igdbId),
      // Art already fetched but the accent never settled for the current cover.
      accentFor
        ? db
            .select({ id: games.igdbId, url: games.coverUrlSmall })
            .from(games)
            .where(
              and(
                isNotNull(games.artCheckedAt),
                isNotNull(games.coverUrlSmall),
                or(isNull(games.accentSource), ne(games.accentSource, games.coverUrlSmall)),
              ),
            )
        : Promise.resolve([]),
    ]);
    const ids = [...unchecked.map((r) => r.id), ...needAccent.map((r) => r.id)];
    const before = await snapshot(ids);
    if (unchecked.length > 0) {
      const fetched = await client.getGames(unchecked.map((r) => r.id));
      await upsertGames(fetched);
      // Games IGDB no longer returns count as checked too, so they are not asked again.
      await db
        .update(games)
        .set({ artCheckedAt: now() })
        .where(
          inArray(
            games.igdbId,
            unchecked.map((r) => r.id),
          ),
        );
    }
    fillAccents(needAccent.flatMap((r) => (r.url ? [{ igdbId: r.id, url: r.url }] : [])));
    await idle();
    const after = await snapshot(ids);
    const updated = ids.filter((id) => before.get(id) !== after.get(id)).length;
    return { checked: ids.length, updated };
  }

  return {
    getGame,
    getGames,
    queryByTags,
    refreshAll,
    backfillArt,
    backfillFacts,
    idle,
    getTimeToBeat,
    warmTimeToBeat,
  };
}
