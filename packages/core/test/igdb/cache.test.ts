import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { createDb, games, runMigrations, timeToBeat, type Db } from '@perch/db';
import { createIgdbClient } from '../../src/igdb/client.js';
import { createIgdbCache, CACHE_TTL_MS } from '../../src/igdb/cache.js';
import { createAccentQueue, type AccentQueue } from '../../src/igdb/accent.js';
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

  function setup(
    intercept?: Parameters<typeof fakeFetch>[0] extends infer O ? O : never,
    mapVocab?: (g: { genres: number[] }) => Record<string, number>,
    accentFor?: (url: string) => Promise<string | null>,
    accentQueue?: AccentQueue,
  ) {
    const net = fakeFetch(intercept);
    const client = createIgdbClient({
      clientId: 'id',
      clientSecret: 'secret',
      fetch: net.fetch,
      maxPerSecond: 1000,
    });
    let now = T0;
    const cache = createIgdbCache({ db, client, now: () => now, mapVocab, accentFor, accentQueue });
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

  it('stores and returns series (collections + offset franchises)', async () => {
    const { cache } = setup({
      intercept: () =>
        json([
          { id: hades.igdbId, name: 'Hades', slug: 'hades', collections: [3], franchises: [4] },
        ]),
    });
    const game = await cache.getGame(hades.igdbId);
    expect(game?.series).toEqual([3, 1_000_004]);
    const [row] = await db.select().from(games).where(eq(games.igdbId, hades.igdbId));
    expect(row?.series).toEqual([3, 1_000_004]);
  });

  it('stores and returns critic rating and store websites, and updates them on refresh', async () => {
    const raw = (rating: number) => ({
      id: hades.igdbId,
      name: 'Hades',
      slug: 'hades',
      aggregated_rating: rating,
      aggregated_rating_count: 17,
      websites: [{ url: 'https://www.gog.com/game/hades', type: 17 }],
    });
    const first = setup({ intercept: () => json([raw(90)]) });
    const game = await first.cache.getGame(hades.igdbId);
    expect(game).toMatchObject({ criticRating: 90, criticRatingCount: 17 });
    const [row] = await db.select().from(games).where(eq(games.igdbId, hades.igdbId));
    expect(row).toMatchObject({
      criticRating: 90,
      criticRatingCount: 17,
      websites: [{ store: 'gog', url: 'https://www.gog.com/game/hades' }],
    });
    const second = setup({ intercept: () => json([raw(75)]) });
    second.setNow(new Date(+T0 + CACHE_TTL_MS + DAY));
    expect((await second.cache.getGame(hades.igdbId))?.criticRating).toBe(75);
  });

  it('refreshAll refetches every cached row by id and upserts it', async () => {
    const first = setup();
    await first.cache.getGame(hades.igdbId);
    const { net, cache } = setup({
      intercept: () => json([{ id: hades.igdbId, name: 'Hades', slug: 'hades', collections: [3] }]),
    });
    const { refreshed, missing } = await cache.refreshAll();
    expect(refreshed).toBeGreaterThanOrEqual(1);
    expect(missing).not.toContain(hades.igdbId);
    expect(net.apiCalls().length).toBeGreaterThanOrEqual(1);
    const [row] = await db.select().from(games).where(eq(games.igdbId, hades.igdbId));
    expect(row?.series).toEqual([3]);
  });

  it('refreshAll reports ids IGDB did not return', async () => {
    const first = setup();
    await first.cache.getGame(hades.igdbId);
    const { cache } = setup({ intercept: () => json([]) });
    const { refreshed, missing } = await cache.refreshAll();
    expect(refreshed).toBe(0);
    expect(missing).toContain(hades.igdbId);
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

    it('writes freshly computed vocab on every upsert path, overwriting stale vocab', async () => {
      const mapVocab = (g: { genres: number[] }) => ({ [`g${g.genres[0]}`]: 1 });
      const { cache, setNow } = setup(
        {
          intercept: ({ body, ...rest }) =>
            body.includes('genres =') ? json(hades.game) : serve({ body, ...rest }),
        },
        mapVocab,
      );
      const vocabOf = async (id: number) =>
        (await db.select().from(games).where(eq(games.igdbId, id)))[0]?.vocab;
      const one = await cache.getGame(hades.igdbId);
      expect(await vocabOf(hades.igdbId)).toEqual(mapVocab(one!));
      await db.update(games).set({ vocab: { old: 1 } });
      setNow(new Date(T0.getTime() + CACHE_TTL_MS + DAY));
      const both = await cache.getGames([hades.igdbId, celeste.igdbId]);
      for (const g of both) expect(await vocabOf(g.igdbId)).toEqual(mapVocab(g));
      await db.update(games).set({ vocab: { old: 1 } });
      const [viaTags] = await cache.queryByTags({
        genres: [1],
        themes: [],
        minRatingCount: 1,
        limit: 1,
      });
      expect(await vocabOf(viaTags!.igdbId)).toEqual(mapVocab(viaTags!));
    });

    describe('stale fallback', () => {
      type Mode = 'ok' | 'miss-hades' | 'fail';
      function stale() {
        let mode: Mode = 'ok';
        const s = setup({
          intercept: ({ body }) => {
            if (mode === 'fail') return new Response('', { status: 400 });
            const res = serve({ body });
            if (mode === 'ok') return res;
            return json(celeste.game);
          },
        });
        return { ...s, setMode: (m: Mode) => (mode = m) };
      }
      const ids = [hades.igdbId, celeste.igdbId];

      it('serves the stale row when IGDB misses the id', async () => {
        const { cache, setNow, setMode } = stale();
        await cache.getGames(ids);
        setNow(new Date(T0.getTime() + CACHE_TTL_MS + DAY));
        setMode('miss-hades');
        const list = await cache.getGames(ids);
        expect(list.map((g) => g.igdbId)).toEqual(ids);
      });

      it('serves the stale rows when the refetch fails, but still throws with no row to fall back on', async () => {
        const { cache, setNow, setMode } = stale();
        await cache.getGames(ids);
        setNow(new Date(T0.getTime() + CACHE_TTL_MS + DAY));
        setMode('fail');
        expect((await cache.getGames(ids)).map((g) => g.igdbId)).toEqual(ids);
        await expect(cache.getGames([...ids, 99999999])).rejects.toThrow(/IGDB/);
      });
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

  describe('art and accent', () => {
    const art = {
      id: hades.igdbId,
      name: 'Hades',
      slug: 'hades',
      cover: { image_id: 'c1' },
      artworks: [{ image_id: 'a1' }],
    };
    const rowOf = async () =>
      (await db.select().from(games).where(eq(games.igdbId, hades.igdbId)))[0];
    const refetched = (net: ReturnType<typeof fakeFetch>, from: number) =>
      net
        .apiCalls()
        .slice(from)
        .some((c) => c.body.includes(String(hades.igdbId)));
    const gate = () => {
      let open!: () => void;
      const opened = new Promise<void>((r) => (open = r));
      return { opened, open };
    };

    it('does not wait for the cover download; the accent lands in the background', async () => {
      const g = gate();
      const urls: string[] = [];
      const { cache } = setup({ intercept: () => json([art]) }, undefined, async (u) => {
        urls.push(u);
        await g.opened;
        return '#c81e28';
      });
      const game = await cache.getGame(hades.igdbId);
      expect(game?.accent).toBeNull();
      expect(await rowOf()).toMatchObject({
        accent: null,
        heroUrl: expect.stringContaining('t_1080p/a1'),
        coverUrlSmall: expect.stringContaining('t_cover_small/c1'),
      });
      g.open();
      await cache.idle();
      expect(urls).toEqual([expect.stringContaining('t_cover_small/c1')]);
      expect(await rowOf()).toMatchObject({
        accent: '#c81e28',
        accentSource: expect.stringContaining('t_cover_small/c1'),
      });
      expect((await cache.getGame(hades.igdbId))?.accent).toBe('#c81e28');
    });

    it('records the source even when no colour is found, and then never recomputes', async () => {
      let calls = 0;
      const { cache, setNow } = setup({ intercept: () => json([art]) }, undefined, async () => {
        calls++;
        return null;
      });
      await cache.getGame(hades.igdbId);
      await cache.idle();
      expect(await rowOf()).toMatchObject({
        accent: null,
        accentSource: expect.stringContaining('c1'),
      });
      setNow(new Date(T0.getTime() + 40 * DAY));
      await cache.getGame(hades.igdbId);
      await cache.idle();
      expect(calls).toBe(1);
    });

    it('a throwing lookup is swallowed and leaves the source unset so it is retried', async () => {
      const { cache } = setup({ intercept: () => json([art]) }, undefined, async () => {
        throw new Error('image host down');
      });
      expect((await cache.getGame(hades.igdbId))?.accent).toBeNull();
      await cache.idle();
      expect(await rowOf()).toMatchObject({ accent: null, accentSource: null });
    });

    it('a changed cover clears the old accent and recomputes', async () => {
      const first = setup({ intercept: () => json([art]) }, undefined, async () => '#112233');
      await first.cache.getGame(hades.igdbId);
      await first.cache.idle();
      expect((await rowOf())?.accent).toBe('#112233');
      const next = setup(
        { intercept: () => json([{ ...art, cover: { image_id: 'c2' } }]) },
        undefined,
        async () => '#445566',
      );
      await next.cache.refreshAll();
      await next.cache.idle();
      expect(await rowOf()).toMatchObject({
        accent: '#445566',
        accentSource: expect.stringContaining('c2'),
      });
      const broken = setup(
        { intercept: () => json([{ ...art, cover: { image_id: 'c3' } }]) },
        undefined,
        async () => {
          throw new Error('x');
        },
      );
      await broken.cache.refreshAll();
      await broken.cache.idle();
      expect((await rowOf())?.accent).toBeNull();
    });

    it('concurrent lookups of the same cover download it once', async () => {
      let calls = 0;
      const g = gate();
      const accentFor = async () => {
        calls++;
        await g.opened;
        return '#00aa55';
      };
      const queue = createAccentQueue(4);
      const a = setup({ intercept: () => json([art]) }, undefined, accentFor, queue);
      const b = setup({ intercept: () => json([art]) }, undefined, accentFor, queue);
      await Promise.all([a.cache.getGame(hades.igdbId), b.cache.getGame(hades.igdbId)]);
      g.open();
      await Promise.all([a.cache.idle(), b.cache.idle()]);
      expect(calls).toBe(1);
      expect((await rowOf())?.accent).toBe('#00aa55');
    });

    it('backfillArt fills hero and accent, counts only real changes, and skips checked rows', async () => {
      const plain = setup({
        intercept: () =>
          json([{ id: hades.igdbId, name: 'Hades', slug: 'hades', cover: { image_id: 'c1' } }]),
      });
      await plain.cache.getGame(hades.igdbId);
      await db.update(games).set({ artCheckedAt: null }).where(eq(games.igdbId, hades.igdbId));
      const { cache, net } = setup(
        { intercept: () => json([art]) },
        undefined,
        async () => '#00aa55',
      );
      const res = await cache.backfillArt();
      expect(res.updated).toBeGreaterThanOrEqual(1);
      expect(await rowOf()).toMatchObject({
        accent: '#00aa55',
        heroUrl: expect.stringContaining('a1'),
      });
      expect((await rowOf())?.artCheckedAt).not.toBeNull();
      const before = net.apiCalls().length;
      const again = await cache.backfillArt();
      expect(again.updated).toBe(0);
      expect(refetched(net, before)).toBe(false);
    });

    it('backfillArt does not refetch a game that has no art', async () => {
      const bare = { id: hades.igdbId, name: 'Hades', slug: 'hades' };
      const { cache, net } = setup({ intercept: () => json([bare]) });
      await cache.getGame(hades.igdbId);
      await cache.backfillArt();
      const before = net.apiCalls().length;
      await cache.backfillArt();
      expect(refetched(net, before)).toBe(false);
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

    it('warmTimeToBeat fetches missing rows in the background and skips fresh ones', async () => {
      const { net, cache, setNow } = setup();
      cache.warmTimeToBeat([hades.igdbId]);
      await cache.idle();
      const [row] = await db.select().from(timeToBeat).where(eq(timeToBeat.igdbId, hades.igdbId));
      expect(row?.normallySeconds).toBe(253600);
      const calls = net.apiCalls().length;

      setNow(new Date(T0.getTime() + DAY));
      cache.warmTimeToBeat([hades.igdbId]);
      await cache.idle();
      expect(net.apiCalls()).toHaveLength(calls);

      // Past the TTL it refetches.
      setNow(new Date(T0.getTime() + 2 * CACHE_TTL_MS));
      cache.warmTimeToBeat([hades.igdbId]);
      await cache.idle();
      expect(net.apiCalls().at(-1)?.url).toMatch(/game_time_to_beats$/);
    });

    it('warmTimeToBeat resolves once rows are written and dedupes ids already in flight', async () => {
      const { net, cache } = setup();
      const first = cache.warmTimeToBeat([hades.igdbId]);
      const second = cache.warmTimeToBeat([hades.igdbId]);
      await Promise.all([first, second]);
      const [row] = await db.select().from(timeToBeat).where(eq(timeToBeat.igdbId, hades.igdbId));
      expect(row?.normallySeconds).toBe(253600);
      expect(net.apiCalls().filter((c) => /game_time_to_beats$/.test(c.url))).toHaveLength(1);
    });

    it('warmTimeToBeat swallows IGDB errors', async () => {
      const { cache } = setup({ intercept: () => json({ message: 'bad' }, 400) });
      cache.warmTimeToBeat([hades.igdbId]);
      await expect(cache.idle()).resolves.toBeUndefined();
    });

    it('returns null for an unknown game without writing a row', async () => {
      const { cache } = setup();
      expect(await cache.getTimeToBeat(424242)).toBeNull();
      const rows = await db.select().from(timeToBeat).where(eq(timeToBeat.igdbId, 424242));
      expect(rows).toHaveLength(0);
    });
  });
});
