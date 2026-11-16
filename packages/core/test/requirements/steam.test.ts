import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { createDb, gameRequirements, games, runMigrations, type Db } from '@perch/db';
import { RateQueue } from '../../src/igdb/queue.js';
import {
  createSteamClient,
  requirementsExcerpt,
  getRequirements,
  REQUIREMENTS_TTL_MS,
  SteamError,
} from '../../src/requirements/index.js';
import { json, steamFixture } from './helpers.js';

function fakeSteam(handler?: (n: number, url: string) => Response | undefined) {
  const urls: string[] = [];
  const impl = async (input: string | URL | Request) => {
    const url = String(input);
    urls.push(url);
    const override = handler?.(urls.length, url);
    if (override) return override;
    const id = Number(new URL(url).searchParams.get('appids'));
    return json(steamFixture(id).body);
  };
  return { fetch: impl as typeof fetch, urls };
}

function fakeClock() {
  let t = 1_000_000;
  const slept: number[] = [];
  return {
    now: () => t,
    sleep: async (ms: number) => {
      slept.push(ms);
      t += ms;
    },
    slept,
  };
}

describe('steam client', () => {
  it('requests basic,pc_requirements for one app id and returns the html sections', async () => {
    const net = fakeSteam();
    const client = createSteamClient({ fetch: net.fetch, ...fakeClock() });
    const pc = await client.getPcRequirements(1091500);
    expect(pc.minimum).toContain('Processor');
    expect(pc.recommended).toContain('Memory');
    const u = new URL(net.urls[0]!);
    expect(u.origin + u.pathname).toBe('https://store.steampowered.com/api/appdetails');
    expect(u.searchParams.get('appids')).toBe('1091500');
    expect(u.searchParams.get('filters')).toBe('basic,pc_requirements');
  });

  it('returns {} for pc_requirements [] and for success:false', async () => {
    const empty = fakeSteam(() => json({ '5': { success: true, data: { pc_requirements: [] } } }));
    const failed = fakeSteam(() => json({ '5': { success: false } }));
    const clock = fakeClock();
    expect(await createSteamClient({ fetch: empty.fetch, ...clock }).getPcRequirements(5)).toEqual(
      {},
    );
    expect(await createSteamClient({ fetch: failed.fetch, ...clock }).getPcRequirements(5)).toEqual(
      {},
    );
  });

  it('spaces requests at least one second apart', async () => {
    const net = fakeSteam();
    const clock = fakeClock();
    const client = createSteamClient({ fetch: net.fetch, ...clock });
    await Promise.all([220, 620, 1091500].map((id) => client.getPcRequirements(id)));
    expect(net.urls).toHaveLength(3);
    expect(clock.slept.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(2000);
  });

  it('retries 429 then succeeds; gives up on persistent 5xx with SteamError', async () => {
    const flaky = fakeSteam((n) => (n === 1 ? new Response('', { status: 429 }) : undefined));
    const ok = await createSteamClient({ fetch: flaky.fetch, ...fakeClock() }).getPcRequirements(
      1091500,
    );
    expect(ok.minimum).toBeTruthy();
    expect(flaky.urls).toHaveLength(2);

    const down = fakeSteam(() => new Response('', { status: 503 }));
    const client = createSteamClient({ fetch: down.fetch, maxRetries: 2, ...fakeClock() });
    await expect(client.getPcRequirements(1)).rejects.toBeInstanceOf(SteamError);
    expect(down.urls).toHaveLength(3);
  });
});

describe('steam client bad bodies', () => {
  const bodies: Array<[string, () => Response]> = [
    ['null JSON', () => new Response('null', { status: 200 })],
    ['HTML page', () => new Response('<html>Access denied</html>', { status: 200 })],
    ['wrong shape', () => json({ '5': { success: 'yes' } })],
    ['missing app entry', () => json({ '999': { success: true, data: [] } })],
  ];
  it.each(bodies)('%s throws a non-retried SteamError', async (_name, make) => {
    const net = fakeSteam(() => make());
    const client = createSteamClient({ fetch: net.fetch, ...fakeClock() });
    const err = await client.getPcRequirements(5).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SteamError);
    expect((err as SteamError).kind).toBe('body');
    expect(net.urls).toHaveLength(1);
  });
});

describe('rate limiting', () => {
  it('RateQueue.pause delays every later request', async () => {
    const clock = fakeClock();
    const q = new RateQueue(1, clock);
    const starts: number[] = [];
    await q.schedule(async () => starts.push(clock.now()));
    q.pause(5000);
    await q.schedule(async () => starts.push(clock.now()));
    await q.schedule(async () => starts.push(clock.now()));
    expect(starts[1]! - starts[0]!).toBeGreaterThanOrEqual(5000);
    expect(starts[2]! - starts[1]!).toBeGreaterThanOrEqual(1000);
  });

  it('a Retry-After on 429 pauses the shared queue, so other calls wait too', async () => {
    const clock = fakeClock();
    const at: Record<number, number[]> = {};
    let first = true;
    const net = fakeSteam((_n, url) => {
      const id = Number(new URL(url).searchParams.get('appids'));
      (at[id] ??= []).push(clock.now());
      if (id === 220 && first) {
        first = false;
        return new Response('', { status: 429, headers: { 'retry-after': '30' } });
      }
      return undefined;
    });
    const client = createSteamClient({ fetch: net.fetch, ...clock });
    await client.getPcRequirements(220);
    await client.getPcRequirements(620);
    const [t429, retry] = at[220]!;
    expect(retry! - t429!).toBeGreaterThanOrEqual(30_000);
    expect(at[620]![0]! - retry!).toBeGreaterThanOrEqual(1000);
  });
});

describe('requirementsExcerpt', () => {
  it('keeps an inline "Recommended:" line inside the minimum block', () => {
    const minimum =
      '<strong>Minimum:</strong><br>Processor: A<br><strong>Recommended:</strong><br>Processor: B';
    const text = requirementsExcerpt({ minimum }) ?? '';
    expect(text).toBe('Minimum:\nProcessor: A\nRecommended:\nProcessor: B');
  });

  it('does not duplicate the section headers', () => {
    const text =
      requirementsExcerpt({
        minimum: '<strong>Minimum:</strong><br>Processor: A',
        recommended: '<strong>Recommended:</strong><br>Processor: B',
      }) ?? '';
    expect(text.match(/^Minimum:$/gm)).toHaveLength(1);
    expect(text.match(/^Recommended:$/gm)).toHaveLength(1);
  });
});

const url = process.env.DATABASE_URL_TEST;
if (!url) {
  console.warn('[skip] DATABASE_URL_TEST is not set; requirements cache tests skipped');
}

const DAY = 24 * 60 * 60 * 1000;
const T0 = new Date('2026-06-01T00:00:00Z');
const WITH_STEAM = 9_900_001;
const NO_STEAM = 9_900_002;
const NO_REQS = 9_900_003;
const IDS = [WITH_STEAM, NO_STEAM, NO_REQS];

describe.skipIf(!url)('getRequirements db cache', () => {
  let db: Db;
  beforeAll(async () => {
    await runMigrations(url!);
    db = createDb(url!);
  });
  afterAll(async () => {
    await db?.$client.end({ timeout: 1 });
  });
  beforeEach(async () => {
    await db.delete(games).where(inArray(games.igdbId, IDS));
    await db.insert(games).values([
      { igdbId: WITH_STEAM, name: 'Cyberpunk test', slug: 'cp-test', steamAppId: 1091500 },
      { igdbId: NO_STEAM, name: 'No steam test', slug: 'ns-test', steamAppId: null },
      { igdbId: NO_REQS, name: 'No reqs test', slug: 'nr-test', steamAppId: 5 },
    ]);
  });

  function setup(handler?: Parameters<typeof fakeSteam>[0]) {
    const net = fakeSteam(handler);
    const client = createSteamClient({ fetch: net.fetch, ...fakeClock() });
    let now = T0;
    return {
      net,
      get: (id: number) => getRequirements(db, id, { client, now: () => now }),
      setNow: (d: Date) => {
        now = d;
      },
    };
  }

  it('miss: fetches, parses, upserts and returns the row', async () => {
    const { net, get } = setup();
    const row = await get(WITH_STEAM);
    expect(net.urls).toHaveLength(1);
    expect(row).toMatchObject({ igdbId: WITH_STEAM, source: 'steam', minRamGb: 12, recRamGb: 16 });
    expect(row?.minGpuScore).toBeGreaterThan(0);
    expect(row?.recGpuScore).toBeGreaterThan(row?.minGpuScore ?? 0);
    expect(row?.minCpuScore).toBeGreaterThan(0);
    expect(row?.raw).toContain('GeForce GTX 1060');
    expect(row?.raw?.match(/^Recommended:$/gm)).toHaveLength(1);
    expect(row?.raw?.match(/^Minimum:$/gm)).toHaveLength(1);
    expect(row?.parsedAt).toEqual(T0);
    const rows = await db
      .select()
      .from(gameRequirements)
      .where(eq(gameRequirements.igdbId, WITH_STEAM));
    expect(rows).toHaveLength(1);
  });

  it('hit: serves a fresh row without fetching', async () => {
    const { net, get, setNow } = setup();
    const first = await get(WITH_STEAM);
    setNow(new Date(T0.getTime() + REQUIREMENTS_TTL_MS - DAY));
    const second = await get(WITH_STEAM);
    expect(net.urls).toHaveLength(1);
    expect(second).toEqual(first);
  });

  it('refetches and updates in place once older than 30 days', async () => {
    const { net, get, setNow } = setup();
    await get(WITH_STEAM);
    const later = new Date(T0.getTime() + 31 * DAY);
    setNow(later);
    const row = await get(WITH_STEAM);
    expect(net.urls).toHaveLength(2);
    expect(row?.parsedAt).toEqual(later);
    const rows = await db
      .select()
      .from(gameRequirements)
      .where(eq(gameRequirements.igdbId, WITH_STEAM));
    expect(rows).toHaveLength(1);
  });

  it('serves the stale row if the refetch fails', async () => {
    const { get, setNow, net } = setup((n) =>
      n > 1 ? new Response('', { status: 500 }) : undefined,
    );
    const first = await get(WITH_STEAM);
    setNow(new Date(T0.getTime() + 40 * DAY));
    expect(await get(WITH_STEAM)).toEqual(first);
    expect(net.urls.length).toBeGreaterThan(1);
  });

  it('a game without steam_app_id (or without a games row) returns null and never fetches', async () => {
    const { net, get } = setup();
    expect(await get(NO_STEAM)).toBeNull();
    expect(await get(9_900_099)).toBeNull();
    expect(net.urls).toHaveLength(0);
  });

  it('caches an all-null row when Steam lists no requirements', async () => {
    const { net, get } = setup(() =>
      json({ '5': { success: true, data: { pc_requirements: [] } } }),
    );
    const row = await get(NO_REQS);
    expect(row).toMatchObject({
      minGpuScore: null,
      minCpuScore: null,
      minRamGb: null,
      recRamGb: null,
    });
    await get(NO_REQS);
    expect(net.urls).toHaveLength(1);
  });

  it('an empty refetch keeps the good cached row and only bumps parsedAt', async () => {
    let empty = false;
    const { get, setNow } = setup(() =>
      empty ? json({ '1091500': { success: true, data: { pc_requirements: [] } } }) : undefined,
    );
    const first = await get(WITH_STEAM);
    empty = true;
    const later = new Date(T0.getTime() + 31 * DAY);
    setNow(later);
    const row = await get(WITH_STEAM);
    expect(row).toEqual({ ...first, parsedAt: later });
    expect(row?.minGpuScore).toBeGreaterThan(0);
  });

  it('success:false does not overwrite a good cached row either', async () => {
    let fail = false;
    const { get, setNow } = setup(() =>
      fail ? json({ '1091500': { success: false } }) : undefined,
    );
    const first = await get(WITH_STEAM);
    fail = true;
    setNow(new Date(T0.getTime() + 31 * DAY));
    expect(await get(WITH_STEAM)).toMatchObject({ minGpuScore: first?.minGpuScore, minRamGb: 12 });
  });

  it('a bad body means no requirements: null, nothing cached', async () => {
    const { get } = setup(() => new Response('<html>nope</html>', { status: 200 }));
    expect(await get(WITH_STEAM)).toBeNull();
    const rows = await db
      .select()
      .from(gameRequirements)
      .where(eq(gameRequirements.igdbId, WITH_STEAM));
    expect(rows).toHaveLength(0);
  });

  it('a bad body keeps serving the stale row', async () => {
    let bad = false;
    const { get, setNow } = setup(() => (bad ? new Response('null', { status: 200 }) : undefined));
    const first = await get(WITH_STEAM);
    bad = true;
    setNow(new Date(T0.getTime() + 40 * DAY));
    expect(await get(WITH_STEAM)).toEqual(first);
  });
});
