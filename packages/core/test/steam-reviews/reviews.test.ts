import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createDb, games, runMigrations, type Db } from '@perch/db';
import {
  createSteamClient,
  getSharedSteamClient,
  type SteamClient,
} from '../../src/requirements/index.js';
import {
  loadSteamReviews,
  parseReviewSummary,
  steamReviewsFor,
  steamReviewsIdle,
  STEAM_REVIEWS_TTL_MS,
} from '../../src/steam-reviews/index.js';

const summaryBody = (over: Record<string, unknown> = {}) => ({
  response: {
    query_summary: {
      num_reviews: 1,
      review_score: 9,
      review_score_desc: 'Overwhelmingly Positive',
      total_positive: 196,
      total_negative: 4,
      total_reviews: 200,
      ...over,
    },
  },
});

describe('parseReviewSummary', () => {
  it('returns description, rounded positive percent and total', () => {
    expect(parseReviewSummary(summaryBody())).toEqual({
      desc: 'Overwhelmingly Positive',
      pct: 98,
      total: 200,
    });
  });
  it('is null when there are no reviews, the app is unknown, or the shape is wrong', () => {
    expect(parseReviewSummary(summaryBody({ total_reviews: 0, total_positive: 0 }))).toBeNull();
    expect(parseReviewSummary({ response: {} })).toBeNull();
    expect(parseReviewSummary({ success: 1 })).toBeNull();
    expect(parseReviewSummary('nope')).toBeNull();
  });
});

describe('getSharedSteamClient', () => {
  it('returns one client for every caller', () => {
    expect(getSharedSteamClient()).toBe(getSharedSteamClient());
  });
});

describe('steam client getReviewSummary', () => {
  it('requests the GetAppReviews summary for one app and parses it', async () => {
    const urls: string[] = [];
    const client = createSteamClient({
      fetch: (async (u: string) => {
        urls.push(String(u));
        return new Response(JSON.stringify(summaryBody()), { status: 200 });
      }) as unknown as typeof fetch,
      sleep: async () => {},
    });
    expect(await client.getReviewSummary(1145360)).toEqual({
      desc: 'Overwhelmingly Positive',
      pct: 98,
      total: 200,
    });
    const u = new URL(urls[0]!);
    expect(u.origin + u.pathname).toBe(
      'https://api.steampowered.com/IUserReviewsService/GetAppReviews/v1/',
    );
    expect(u.searchParams.get('appid')).toBe('1145360');
    expect(u.searchParams.get('num_per_page')).toBe('1');
    expect(u.searchParams.get('languages[0]')).toBe('all');
    expect(u.searchParams.get('purchase_type')).toBe('0');
    expect(u.searchParams.get('review_type')).toBe('0');
  });
  it('is null for an unreadable body', async () => {
    const client = createSteamClient({
      fetch: (async () => new Response('<html>', { status: 200 })) as unknown as typeof fetch,
      sleep: async () => {},
    });
    expect(await client.getReviewSummary(1)).toBeNull();
  });
});

const url = process.env.DATABASE_URL_TEST;
if (!url) console.warn('[skip] DATABASE_URL_TEST is not set; steam review cache tests skipped');

const ID = 987_654_321;
const T0 = new Date('2026-06-01T00:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

describe.skipIf(!url)('steamReviewsFor', () => {
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
    await db.delete(games).where(eq(games.igdbId, ID));
    await db.insert(games).values({ igdbId: ID, name: 'Reviewed', slug: 'reviewed-test' });
  });

  function fake(result: () => Promise<unknown>) {
    const calls: number[] = [];
    const client = {
      async getPcRequirements() {
        return {};
      },
      async getDeckCompat() {
        return 'unknown';
      },
      async getReviewSummary(id: number) {
        calls.push(id);
        return result();
      },
    } as unknown as SteamClient;
    return { client, calls };
  }
  const reviews = { desc: 'Very Positive', pct: 90, total: 50 };
  const game = { igdbId: ID, steamAppId: 77 };

  it('fetches, stores and returns the summary; a fresh row is not refetched', async () => {
    const f = fake(async () => reviews);
    const opts = { client: f.client, now: () => T0 };
    expect(await steamReviewsFor(db, game, opts)).toEqual(reviews);
    expect(
      await steamReviewsFor(db, game, { ...opts, now: () => new Date(+T0 + 6 * DAY) }),
    ).toEqual(reviews);
    expect(f.calls).toEqual([77]);
    expect((await loadSteamReviews(db, ID))?.reviews).toEqual(reviews);
  });

  it('refetches after the 7 day TTL', async () => {
    const f = fake(async () => reviews);
    await steamReviewsFor(db, game, { client: f.client, now: () => T0 });
    await steamReviewsFor(db, game, {
      client: f.client,
      now: () => new Date(+T0 + STEAM_REVIEWS_TTL_MS + 1000),
    });
    expect(f.calls).toHaveLength(2);
  });

  it('keeps the stale summary when a refetch fails, and swallows the error', async () => {
    const ok = fake(async () => reviews);
    await steamReviewsFor(db, game, { client: ok.client, now: () => T0 });
    const bad = fake(async () => {
      throw new Error('boom');
    });
    const later = { client: bad.client, now: () => new Date(+T0 + 9 * DAY) };
    expect(await steamReviewsFor(db, game, later)).toEqual(reviews);
    await steamReviewsIdle();
  });

  it('serves a stale summary at once and refreshes it in the background', async () => {
    const ok = fake(async () => reviews);
    await steamReviewsFor(db, game, { client: ok.client, now: () => T0 });
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const newer = { desc: 'Mixed', pct: 55, total: 99 };
    const slow = fake(async () => {
      await gate;
      return newer;
    });
    const later = { client: slow.client, now: () => new Date(+T0 + 9 * DAY), waitMs: 60_000 };
    // waitMs is huge, so this only returns because the stale value is served without waiting.
    expect(await steamReviewsFor(db, game, later)).toEqual(reviews);
    release();
    await steamReviewsIdle();
    expect((await loadSteamReviews(db, ID))?.reviews).toEqual(newer);
  });

  it('negative-caches a failed fetch for 6 hours and logs a warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const bad = fake(async () => {
      throw new Error('boom');
    });
    const at = (ms: number) => ({ client: bad.client, now: () => new Date(+T0 + ms) });
    expect(await steamReviewsFor(db, game, at(0))).toBeNull();
    await steamReviewsFor(db, game, at(60 * 60 * 1000));
    expect(bad.calls).toHaveLength(1);
    await steamReviewsFor(db, game, at(7 * 60 * 60 * 1000));
    expect(bad.calls).toHaveLength(2);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('never throws: a database error gives null', async () => {
    const broken = {
      select() {
        throw new Error('db down');
      },
    } as unknown as Db;
    const f = fake(async () => reviews);
    expect(await steamReviewsFor(broken, game, { client: f.client })).toBeNull();
  });

  it('is null and not stored as data when the app has no reviews; asked again only after the TTL', async () => {
    const f = fake(async () => null);
    expect(await steamReviewsFor(db, game, { client: f.client, now: () => T0 })).toBeNull();
    await steamReviewsFor(db, game, { client: f.client, now: () => new Date(+T0 + DAY) });
    expect(f.calls).toHaveLength(1);
  });

  it('does nothing for a game without a Steam app id', async () => {
    const f = fake(async () => reviews);
    expect(
      await steamReviewsFor(db, { igdbId: ID, steamAppId: null }, { client: f.client }),
    ).toBeNull();
    expect(f.calls).toHaveLength(0);
  });

  it('does not block past waitMs but still stores the result in the background', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const f = fake(async () => {
      await gate;
      return reviews;
    });
    const out = await steamReviewsFor(db, game, { client: f.client, now: () => T0, waitMs: 20 });
    expect(out).toBeNull();
    release();
    await steamReviewsIdle();
    expect((await loadSteamReviews(db, ID))?.reviews).toEqual(reviews);
  });
});
