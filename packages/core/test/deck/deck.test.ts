import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { eq, inArray } from 'drizzle-orm';
import { createDb, deckCompat, runMigrations, type Db } from '@perch/db';
import { createSteamClient, SteamError } from '../../src/requirements/index.js';
import { DECK_COMPAT_TTL_MS, getDeckCategory } from '../../src/deck/index.js';

const fixtureDir = fileURLToPath(new URL('../fixtures/deck/', import.meta.url));
const fixture = (id: number): unknown =>
  JSON.parse(readFileSync(`${fixtureDir}${id}.json`, 'utf8')) as unknown;
const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), { status, headers });

function fakeDeck(handler?: (n: number, id: number) => Response | undefined) {
  const urls: string[] = [];
  const impl = async (input: string | URL | Request) => {
    const url = String(input);
    urls.push(url);
    const id = Number(new URL(url).searchParams.get('nAppID'));
    return handler?.(urls.length, id) ?? json(fixture(id));
  };
  return { fetch: impl as typeof fetch, urls };
}

function fakeClock() {
  let t = 1_000_000;
  return {
    now: () => t,
    sleep: async (ms: number) => {
      t += ms;
    },
  };
}

describe('steam client getDeckCompat', () => {
  it('requests the deck report endpoint for one app id', async () => {
    const net = fakeDeck();
    await createSteamClient({ fetch: net.fetch, ...fakeClock() }).getDeckCompat(1145360);
    const u = new URL(net.urls[0]!);
    expect(u.origin + u.pathname).toBe(
      'https://store.steampowered.com/saleaction/ajaxgetdeckappcompatibilityreport',
    );
    expect(u.searchParams.get('nAppID')).toBe('1145360');
  });

  it.each([
    [1145360, 'verified'],
    [730, 'playable'],
    [271590, 'unsupported'],
    [1, 'unknown'],
  ] as const)('maps fixture %i to %s', async (id, category) => {
    const net = fakeDeck();
    const client = createSteamClient({ fetch: net.fetch, ...fakeClock() });
    expect(await client.getDeckCompat(id)).toBe(category);
  });

  it.each([
    ['category 0', { success: 1, results: { appid: 5, resolved_category: 0 } }],
    ['missing results', { success: 1 }],
    ['results is null', { success: 1, results: null }],
    ['results is []', { success: 1, results: [] }],
    ['missing category', { success: 1, results: { appid: 5 } }],
    ['unknown category number', { success: 1, results: { resolved_category: 9 } }],
    ['category as string', { success: 1, results: { resolved_category: '3' } }],
    ['body is an array', []],
    ['body is null', null],
  ])('treats %s as unknown', async (_name, body) => {
    const net = fakeDeck(() => json(body));
    const client = createSteamClient({ fetch: net.fetch, ...fakeClock() });
    expect(await client.getDeckCompat(5)).toBe('unknown');
  });

  it('throws SteamError(body) when the response is not JSON', async () => {
    const net = fakeDeck(() => new Response('<html>nope</html>', { status: 200 }));
    const client = createSteamClient({ fetch: net.fetch, ...fakeClock() });
    await expect(client.getDeckCompat(5)).rejects.toMatchObject({ kind: 'body' });
  });

  it('retries 5xx then succeeds', async () => {
    const net = fakeDeck((n) => (n === 1 ? new Response('', { status: 503 }) : undefined));
    const client = createSteamClient({ fetch: net.fetch, ...fakeClock() });
    expect(await client.getDeckCompat(1145360)).toBe('verified');
    expect(net.urls).toHaveLength(2);
  });

  it('throws SteamError with status on a non-retryable HTTP error', async () => {
    const net = fakeDeck(() => new Response('', { status: 404 }));
    const client = createSteamClient({ fetch: net.fetch, ...fakeClock() });
    const err = await client.getDeckCompat(5).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SteamError);
    expect(err).toMatchObject({ status: 404, kind: 'http' });
    expect(net.urls).toHaveLength(1);
  });

  it('gives up after maxRetries on persistent 500s', async () => {
    const net = fakeDeck(() => new Response('', { status: 500 }));
    const client = createSteamClient({ fetch: net.fetch, maxRetries: 2, ...fakeClock() });
    await expect(client.getDeckCompat(5)).rejects.toMatchObject({ status: 500 });
    expect(net.urls).toHaveLength(3);
  });
});

const url = process.env.DATABASE_URL_TEST;
if (!url) console.warn('[skip] DATABASE_URL_TEST is not set; deck cache tests skipped');

const DAY = 24 * 60 * 60 * 1000;
const T0 = new Date('2026-06-01T00:00:00Z');
const IDS = [1145360, 271590, 1];

describe.skipIf(!url)('getDeckCategory db cache', () => {
  let db: Db;
  beforeAll(async () => {
    await runMigrations(url!);
    db = createDb(url!);
  });
  afterAll(async () => {
    await db?.$client.end({ timeout: 1 });
  });
  beforeEach(async () => {
    await db.delete(deckCompat).where(inArray(deckCompat.steamAppId, IDS));
  });

  function setup(handler?: Parameters<typeof fakeDeck>[0]) {
    const net = fakeDeck(handler);
    const client = createSteamClient({ fetch: net.fetch, ...fakeClock() });
    let now = T0;
    return {
      net,
      get: (id: number) => getDeckCategory(db, id, { client, now: () => now }),
      setNow: (d: Date) => {
        now = d;
      },
    };
  }
  const rowFor = async (id: number) =>
    (await db.select().from(deckCompat).where(eq(deckCompat.steamAppId, id)))[0];

  it('TTL is 7 days', () => {
    expect(DECK_COMPAT_TTL_MS).toBe(7 * DAY);
  });

  it('miss: fetches, stores and returns the category', async () => {
    const { net, get } = setup();
    expect(await get(1145360)).toBe('verified');
    expect(net.urls).toHaveLength(1);
    expect(await rowFor(1145360)).toMatchObject({ category: 'verified', checkedAt: T0 });
  });

  it('hit within the TTL: no fetch', async () => {
    const { net, get, setNow } = setup();
    await get(1145360);
    setNow(new Date(T0.getTime() + 7 * DAY - 1000));
    expect(await get(1145360)).toBe('verified');
    expect(net.urls).toHaveLength(1);
  });

  it('refetches after the TTL and updates the row', async () => {
    let category = 3;
    const { net, get, setNow } = setup(() =>
      json({ success: 1, results: { resolved_category: category } }),
    );
    expect(await get(1145360)).toBe('verified');
    category = 2;
    setNow(new Date(T0.getTime() + 7 * DAY + 1000));
    expect(await get(1145360)).toBe('playable');
    expect(net.urls).toHaveLength(2);
    expect(await rowFor(1145360)).toMatchObject({
      category: 'playable',
      checkedAt: new Date(T0.getTime() + 7 * DAY + 1000),
    });
  });

  it('caches unknown answers too', async () => {
    const { net, get } = setup();
    expect(await get(1)).toBe('unknown');
    await get(1);
    expect(net.urls).toHaveLength(1);
    expect(await rowFor(1)).toMatchObject({ category: 'unknown' });
  });

  it('HTTP error on a stale row: keeps and returns the old category', async () => {
    const { get, setNow } = setup();
    await get(271590);
    setNow(new Date(T0.getTime() + 8 * DAY));
    const failing = setup(() => new Response('', { status: 404 }));
    failing.setNow(new Date(T0.getTime() + 8 * DAY));
    expect(await failing.get(271590)).toBe('unsupported');
    expect(await rowFor(271590)).toMatchObject({ category: 'unsupported', checkedAt: T0 });
  });

  it('HTTP error with no row: throws and stores nothing', async () => {
    const { get } = setup(() => new Response('', { status: 404 }));
    await expect(get(1145360)).rejects.toBeInstanceOf(SteamError);
    expect(await rowFor(1145360)).toBeUndefined();
  });

  it('unreadable body with no row: unknown, nothing stored', async () => {
    const { get } = setup(() => new Response('<html>', { status: 200 }));
    expect(await get(1145360)).toBe('unknown');
    expect(await rowFor(1145360)).toBeUndefined();
  });
});
