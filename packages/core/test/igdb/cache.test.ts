import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { createDb, games, runMigrations, timeToBeat, type Db } from '@perch/db';
import { createIgdbClient } from '../../src/igdb/client.js';
import { createIgdbCache, CACHE_TTL_MS } from '../../src/igdb/cache.js';
import { fakeFetch, fixture, fixtures, json } from './helpers.js';

const url = process.env.DATABASE_URL_TEST;
if (!url) {
  console.warn('[skip] DATABASE_URL_TEST is not set; IGDB cache tests skipped');
}

const DAY = 24 * 60 * 60 * 1000;
const T0 = new Date('2026-06-01T00:00:00Z');
const hades = fixture('Hades');

describe.skipIf(!url)('igdb db cache', () => {
  let db: Db;
  beforeAll(async () => {
    await runMigrations(url!);
    db = createDb(url!);
  });
  afterAll(async () => {
    await db?.$client.end({ timeout: 1 });
  });
  beforeEach(async () => {
    await db.delete(games).where(
      inArray(
        games.igdbId,
        fixtures.map((f) => f.igdbId),
      ),
    );
  });

  function setup(intercept?: Parameters<typeof fakeFetch>[0] extends infer O ? O : never) {
    const net = fakeFetch(intercept);
    const client = createIgdbClient({
      clientId: 'id',
      clientSecret: 'secret',
      fetch: net.fetch,
      maxPerSecond: 1000,
    });
    let now = T0;
    const cache = createIgdbCache({ db, client, now: () => now });
    return {
      net,
      cache,
      setNow: (d: Date) => {
        now = d;
      },
    };
  }

  it('miss: fetches from IGDB and upserts the games row', async () => {
    const { net, cache } = setup();
    const game = await cache.getGame(hades.igdbId);
    expect(game?.steamAppId).toBe(1145360);
    expect(net.apiCalls()).toHaveLength(1);
    const [row] = await db.select().from(games).where(eq(games.igdbId, hades.igdbId));
    expect(row).toMatchObject({
      name: 'Hades',
      slug: (hades.game[0] as { slug: string }).slug,
      steamAppId: 1145360,
    });
    expect(row?.fetchedAt).toEqual(T0);
    expect(row?.genres).toEqual(game?.genres);
  });

  it('hit: serves from the DB without touching the network', async () => {
    const { net, cache, setNow } = setup();
    const first = await cache.getGame(hades.igdbId);
    setNow(new Date(T0.getTime() + CACHE_TTL_MS - DAY));
    const second = await cache.getGame(hades.igdbId);
    expect(net.apiCalls()).toHaveLength(1);
    // `rating` is a float4 column, so it comes back rounded.
    expect(second).toEqual({ ...first, rating: expect.closeTo(first!.rating!, 3) });
  });

  it('stale: refetches after the 30 day TTL, keeps vocab, bumps fetched_at', async () => {
    const { net, cache, setNow } = setup();
    await cache.getGame(hades.igdbId);
    await db
      .update(games)
      .set({ vocab: { roguelike: 1 } })
      .where(eq(games.igdbId, hades.igdbId));
    const later = new Date(T0.getTime() + CACHE_TTL_MS + DAY);
    setNow(later);
    await cache.getGame(hades.igdbId);
    expect(net.apiCalls()).toHaveLength(2);
    const [row] = await db.select().from(games).where(eq(games.igdbId, hades.igdbId));
    expect(row?.fetchedAt).toEqual(later);
    expect(row?.vocab).toEqual({ roguelike: 1 });
  });

  it('returns null for an unknown game and stores nothing', async () => {
    const { cache } = setup();
    expect(await cache.getGame(424242)).toBeNull();
    const rows = await db.select().from(games).where(eq(games.igdbId, 424242));
    expect(rows).toHaveLength(0);
  });

  describe('batched lookups', () => {
    const celeste = fixture('Celeste');
    const idsOf = (body: string) =>
      (/where id = \(?([\d,]+)/.exec(body)?.[1] ?? '').split(',').map(Number);
    const serve = ({ body }: { body: string }) => {
      const ids = idsOf(body);
      return json(fixtures.filter((f) => ids.includes(f.igdbId)).flatMap((f) => f.game));
    };

    it('getGames: fetches only the missing ids in one query and upserts them', async () => {
      const { net, cache } = setup({ intercept: serve });
      await cache.getGame(hades.igdbId);
      const list = await cache.getGames([hades.igdbId, celeste.igdbId, 424242]);
      expect(list.map((g) => g.igdbId)).toEqual([hades.igdbId, celeste.igdbId]);
      const calls = net.apiCalls();
      expect(calls).toHaveLength(2); // getGame + one batch
      expect(idsOf(calls[1]!.body)).toEqual([celeste.igdbId, 424242]);
      const rows = await db.select().from(games).where(eq(games.igdbId, celeste.igdbId));
      expect(rows).toHaveLength(1);
      // Second call is fully cached except the unknown id.
      await cache.getGames([hades.igdbId, celeste.igdbId]);
      expect(net.apiCalls()).toHaveLength(2);
    });

    it('getGames keeps vocab on refetch', async () => {
      const { cache, setNow } = setup({ intercept: serve });
      await cache.getGames([hades.igdbId]);
      await db
        .update(games)
        .set({ vocab: { roguelike: 1 } })
        .where(eq(games.igdbId, hades.igdbId));
      setNow(new Date(T0.getTime() + CACHE_TTL_MS + DAY));
      await cache.getGames([hades.igdbId]);
      const [row] = await db.select().from(games).where(eq(games.igdbId, hades.igdbId));
      expect(row?.vocab).toEqual({ roguelike: 1 });
    });

    it('queryByTags: upserts every result', async () => {
      const { cache } = setup({ intercept: () => json([...hades.game, ...celeste.game]) });
      const list = await cache.queryByTags({
        genres: [12],
        themes: [],
        minRatingCount: 50,
        limit: 10,
      });
      expect(list).toHaveLength(2);
      const rows = await db
        .select()
        .from(games)
        .where(inArray(games.igdbId, [hades.igdbId, celeste.igdbId]));
      expect(rows).toHaveLength(2);
    });
  });

  describe('time to beat', () => {
    it('miss: fetches the game and time-to-beat, then hits the cache', async () => {
      const { net, cache, setNow } = setup();
      const ttb = await cache.getTimeToBeat(hades.igdbId);
      expect(ttb).toMatchObject({ hastilySeconds: 139240, normallySeconds: 253600, count: 13 });
      expect(net.apiCalls()).toHaveLength(2); // games + game_time_to_beats
      const [row] = await db.select().from(timeToBeat).where(eq(timeToBeat.igdbId, hades.igdbId));
      expect(row?.completelySeconds).toBe(542700);

      setNow(new Date(T0.getTime() + DAY));
      expect(await cache.getTimeToBeat(hades.igdbId)).toEqual(ttb);
      expect(net.apiCalls()).toHaveLength(2);
    });

    it('stale: refetches only time-to-beat when the game row is still fresh', async () => {
      const { net, cache, setNow } = setup();
      await cache.getTimeToBeat(hades.igdbId);
      // Make only the ttb row stale.
      await db
        .update(timeToBeat)
        .set({ checkedAt: new Date(T0.getTime() - 2 * CACHE_TTL_MS) })
        .where(eq(timeToBeat.igdbId, hades.igdbId));
      setNow(new Date(T0.getTime() + DAY));
      await cache.getTimeToBeat(hades.igdbId);
      expect(net.apiCalls()).toHaveLength(3);
      expect(net.apiCalls().at(-1)?.url).toMatch(/game_time_to_beats$/);
    });

    it('caches "no data" so it is not refetched, and returns null', async () => {
      const { net, cache } = setup({
        intercept: (c) => (c.url.endsWith('/game_time_to_beats') ? json([]) : undefined),
      });
      expect(await cache.getTimeToBeat(hades.igdbId)).toBeNull();
      expect(await cache.getTimeToBeat(hades.igdbId)).toBeNull();
      expect(net.apiCalls()).toHaveLength(2);
    });

    it('returns null for an unknown game without writing a row', async () => {
      const { cache } = setup();
      expect(await cache.getTimeToBeat(424242)).toBeNull();
      const rows = await db.select().from(timeToBeat).where(eq(timeToBeat.igdbId, 424242));
      expect(rows).toHaveLength(0);
    });
  });
});
