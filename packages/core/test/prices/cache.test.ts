import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createDb, gamePrices, games, runMigrations, type Db } from '@perch/db';
import {
  priceInfoSchema,
  pricesFresh,
  pricesIdle,
  pricesLookup,
  resetPriceFailures,
  PRICES_TTL_MS,
  CheapSharkQueueFullError,
  type CheapSharkClient,
  type PriceInfo,
} from '../../src/prices/index.js';

const url = process.env.DATABASE_URL_TEST;
if (!url) console.warn('[skip] DATABASE_URL_TEST is not set; prices cache tests skipped');

const ID = 987_654_330;
const T0 = new Date('2026-06-01T00:00:00Z');
const HOUR = 60 * 60 * 1000;
const info: PriceInfo = {
  currency: 'USD',
  best: {
    store: 'GOG',
    price: 4.99,
    retailPrice: 9.99,
    savingsPct: 50,
    url: 'https://www.cheapshark.com/redirect?dealID=x',
  },
  historicLow: { price: 0.99, date: null },
};

describe('priceInfoSchema', () => {
  it('accepts a full payload and rejects a bad discount', () => {
    expect(priceInfoSchema.safeParse(info).success).toBe(true);
    expect(
      priceInfoSchema.safeParse({ ...info, best: { ...info.best, savingsPct: 150 } }).success,
    ).toBe(false);
  });
});

describe.skipIf(!url)('pricesLookup', () => {
  let db: Db;
  beforeAll(async () => {
    await runMigrations(url!);
    db = createDb(url!);
  });
  afterAll(async () => {
    await db.delete(games).where(eq(games.igdbId, ID));
    await db?.$client.end({ timeout: 1 });
  });
  beforeEach(async () => {
    resetPriceFailures();
    await db.delete(games).where(eq(games.igdbId, ID));
    await db.insert(games).values({ igdbId: ID, name: 'Portal 2', slug: 'prices-test' });
  });

  function fake(result: () => Promise<PriceInfo | null>) {
    const calls: number[] = [];
    const client: CheapSharkClient = {
      async findPrices(g) {
        calls.push(g.steamAppId ?? -1);
        return result();
      },
    };
    return { client, calls };
  }
  const game = { igdbId: ID, name: 'Portal 2', steamAppId: 620 };

  it('fetches and stores; a fresh row (12 h) is not refetched', async () => {
    const f = fake(async () => info);
    const opts = { client: f.client, now: () => T0 };
    expect((await pricesLookup(db, game, opts)).prices).toEqual(info);
    const later = { ...opts, now: () => new Date(+T0 + 11 * HOUR) };
    expect((await pricesLookup(db, game, later)).prices).toEqual(info);
    expect(f.calls).toEqual([620]);
  });

  it('serves a stale row at once and refreshes it in the background', async () => {
    const cheaper = { ...info, best: { ...info.best!, price: 2 } };
    let next: PriceInfo = info;
    const f = fake(async () => next);
    await pricesLookup(db, game, { client: f.client, now: () => T0 });
    next = cheaper;
    const stale = { client: f.client, now: () => new Date(+T0 + 13 * HOUR) };
    const r = await pricesLookup(db, game, stale);
    expect(r).toEqual({ prices: info, pending: false });
    await pricesIdle();
    expect((await pricesLookup(db, game, stale)).prices).toEqual(cheaper);
    expect(f.calls).toHaveLength(2);
  });

  it('caches "not sold" as a negative and refreshes it after the TTL', async () => {
    const f = fake(async () => null);
    const opts = { client: f.client, now: () => T0 };
    expect(await pricesLookup(db, game, opts)).toEqual({ prices: null, pending: false });
    await pricesLookup(db, game, { ...opts, now: () => new Date(+T0 + HOUR) });
    expect(f.calls).toHaveLength(1);
    await pricesLookup(db, game, { ...opts, now: () => new Date(+T0 + 13 * HOUR) });
    await pricesIdle();
    expect(f.calls).toHaveLength(2);
  });

  it('shares one lookup between overlapping requests', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const f = fake(async () => {
      await gate;
      return info;
    });
    const a = pricesLookup(db, game, { client: f.client });
    const b = pricesLookup(db, game, { client: f.client });
    release();
    expect((await Promise.all([a, b])).map((r) => r.prices)).toEqual([info, info]);
    expect(f.calls).toHaveLength(1);
  });

  it('answers pending when the first lookup outlasts the wait, then has it stored', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const f = fake(async () => {
      await gate;
      return info;
    });
    const r = await pricesLookup(db, game, { client: f.client, waitMs: 5 });
    expect(r).toEqual({ prices: null, pending: true });
    release();
    await pricesIdle();
    expect((await pricesLookup(db, game, { client: f.client })).prices).toEqual(info);
  });

  it('keeps the stored prices on failure and retries only after a short pause', async () => {
    const ok = fake(async () => info);
    await pricesLookup(db, game, { client: ok.client, now: () => T0 });
    const bad = fake(async () => {
      throw new Error('503');
    });
    const t13 = new Date(+T0 + 13 * HOUR);
    const r = await pricesLookup(db, game, { client: bad.client, now: () => t13 });
    expect(r.prices).toEqual(info);
    await pricesIdle();
    await pricesLookup(db, game, { client: bad.client, now: () => new Date(+t13 + 20_000) });
    await pricesIdle();
    expect(bad.calls).toHaveLength(1);
    await pricesLookup(db, game, { client: bad.client, now: () => new Date(+t13 + 90_000) });
    await pricesIdle();
    expect(bad.calls).toHaveLength(2);
  });

  it('a failed first lookup is pending, not "not sold", and stores nothing', async () => {
    const bad = fake(async () => {
      throw new Error('boom');
    });
    expect(await pricesLookup(db, game, { client: bad.client })).toEqual({
      prices: null,
      pending: true,
    });
    const rows = await db.select().from(gamePrices).where(eq(gamePrices.igdbId, ID));
    expect(rows).toEqual([]);
    // Once CheapShark answers, the same game is priced.
    resetPriceFailures();
    const good = fake(async () => info);
    expect(await pricesLookup(db, game, { client: good.client })).toEqual({
      prices: info,
      pending: false,
    });
  });

  it('a full queue is pending too, and is retried at once', async () => {
    const full: CheapSharkClient = {
      async findPrices() {
        throw new CheapSharkQueueFullError();
      },
    };
    expect((await pricesLookup(db, game, { client: full })).pending).toBe(true);
    const good = fake(async () => info);
    expect((await pricesLookup(db, game, { client: good.client })).prices).toEqual(info);
  });

  it('pricesFresh waits for the refresh of a stale row', async () => {
    const cheaper = { ...info, best: { ...info.best!, price: 2 } };
    let next: PriceInfo = info;
    const f = fake(async () => next);
    await pricesLookup(db, game, { client: f.client, now: () => T0 });
    next = cheaper;
    const got = await pricesFresh(db, game, {
      client: f.client,
      now: () => new Date(+T0 + PRICES_TTL_MS + 1),
    });
    expect(got).toEqual({ prices: cheaper, stale: false });
  });

  it('pricesFresh flags stale data when the refresh fails, and fresh data otherwise', async () => {
    const ok = fake(async () => info);
    await pricesLookup(db, game, { client: ok.client, now: () => T0 });
    const bad = fake(async () => {
      throw new Error('down');
    });
    const late = { client: bad.client, now: () => new Date(+T0 + 13 * HOUR) };
    expect(await pricesFresh(db, game, late)).toEqual({ prices: info, stale: true });
    // Within the pause the failure is remembered, not retried.
    expect(await pricesFresh(db, game, late)).toEqual({ prices: info, stale: true });
    expect(bad.calls).toHaveLength(1);
    expect(await pricesFresh(db, game, { ...late, now: () => T0 })).toEqual({
      prices: info,
      stale: false,
    });
  });
});
