import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { inArray } from 'drizzle-orm';
import { hashPassword } from 'better-auth/crypto';
import { createVerifiedUser, type Game, type IgdbClient, type PriceInfo } from '@perch/core';
import { schema } from '@perch/db';
import { cookieFrom, json, setupApi, testUrl } from './harness.js';
import { startPriceWatchJob } from '../src/price-watch-job.js';

const PASSWORD = 'correct-horse-battery';
const A = 987_654_351;
const B = 987_654_352;
const sale: PriceInfo = {
  currency: 'USD',
  best: {
    store: 'GOG',
    price: 4.99,
    retailPrice: 9.99,
    savingsPct: 50,
    url: 'https://www.cheapshark.com/redirect?dealID=x',
  },
  historicLow: null,
};
const fakeGame = (igdbId: number): Game => ({
  igdbId,
  name: `Watch route ${igdbId}`,
  slug: `wr-${igdbId}`,
  coverUrl: null,
  coverUrlSmall: null,
  heroUrl: null,
  accent: null,
  summary: null,
  firstRelease: null,
  genres: [],
  themes: [],
  keywords: [],
  perspectives: [],
  gameModes: [],
  platforms: [6],
  similarIds: [],
  series: [],
  rating: null,
  ratingCount: null,
  steamAppId: null,
  criticRating: null,
  criticRatingCount: null,
  websites: [],
  developers: [],
  publishers: [],
  multiplayer: null,
  dlcCount: 0,
  expansionCount: 0,
  seriesName: null,
});
const fakeIgdb: IgdbClient = {
  async searchGames() {
    return { best: null, candidates: [] };
  },
  async getGame(id) {
    return id === A || id === B ? fakeGame(id) : null;
  },
  async getGames(ids) {
    return ids.filter((id) => id === A || id === B).map(fakeGame);
  },
  async queryByTags() {
    return [];
  },
  async getTimeToBeat() {
    return null;
  },
};
const priceCalls: string[] = [];
const fakePrices = {
  async findPrices(g: { name: string }) {
    priceCalls.push(g.name);
    return sale;
  },
};

describe.skipIf(!testUrl)('price watch routes', () => {
  let ctx: Awaited<ReturnType<typeof setupApi>>;
  beforeAll(async () => {
    const big = { limit: 100_000, windowMs: 60_000 };
    ctx = await setupApi({ api: big, auth: big }, {}, { igdb: fakeIgdb, prices: fakePrices });
  });
  afterAll(async () => {
    await ctx?.db.delete(schema.games).where(inArray(schema.games.igdbId, [A, B]));
    await ctx?.cleanup();
  });

  async function newUser() {
    const email = ctx.newEmail();
    const { id } = await createVerifiedUser(ctx.db, { email, password: PASSWORD }, hashPassword);
    const res = await ctx.app.request(
      '/api/auth/sign-in/email',
      json({ email, password: PASSWORD }),
    );
    return { id, email, cookie: cookieFrom(res) };
  }
  const call = (method: string, path: string, cookie?: string, body?: unknown) =>
    ctx.app.request(path, {
      method,
      headers: {
        ...(cookie ? { cookie } : {}),
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

  it.each([
    ['GET', '/api/watches'],
    ['PUT', `/api/watches/${A}`],
    ['DELETE', `/api/watches/${A}`],
  ])('%s %s needs a session', async (method, path) => {
    expect((await call(method, path, undefined, method === 'PUT' ? {} : undefined)).status).toBe(
      401,
    );
  });

  it('adds, lists with cached prices, retargets and removes a watch', async () => {
    const u = await newUser();
    const put = await call('PUT', `/api/watches/${A}`, u.cookie, { targetPrice: null });
    expect(put.status).toBe(200);
    expect(await put.json()).toEqual({ igdbId: A, targetPrice: null });
    await call('PUT', `/api/watches/${A}`, u.cookie, { targetPrice: 5 });
    await call('PUT', `/api/watches/${B}`, u.cookie, { targetPrice: 3.456 });

    // The list never waits on CheapShark: prices arrive once the background lookup has stored them.
    let body: {
      watches: { igdbId: number; targetPrice: number | null; prices: PriceInfo | null }[];
    };
    await vi.waitFor(async () => {
      body = await (await call('GET', '/api/watches', u.cookie)).json();
      expect(body.watches.every((w) => w.prices !== null)).toBe(true);
    });
    expect(body!.watches.map((w) => [w.igdbId, w.targetPrice]).sort()).toEqual([
      [A, 5],
      [B, 3.46],
    ]);
    expect(body!.watches[0]!.prices!.best!.price).toBe(4.99);

    expect((await call('DELETE', `/api/watches/${A}`, u.cookie)).status).toBe(200);
    const after = await (await call('GET', '/api/watches', u.cookie)).json();
    expect(after.watches.map((w: { igdbId: number }) => w.igdbId)).toEqual([B]);
  });

  it('keeps each user watches private', async () => {
    const one = await newUser();
    const two = await newUser();
    await call('PUT', `/api/watches/${A}`, one.cookie, { targetPrice: null });
    const body = await (await call('GET', '/api/watches', two.cookie)).json();
    expect(body.watches).toEqual([]);
  });

  it('rejects a bad target and an unknown game', async () => {
    const u = await newUser();
    expect((await call('PUT', `/api/watches/${A}`, u.cookie, { targetPrice: -2 })).status).toBe(
      400,
    );
    expect((await call('PUT', `/api/watches/${A}`, u.cookie, {})).status).toBe(400);
    expect(
      (await call('PUT', '/api/watches/999999999', u.cookie, { targetPrice: null })).status,
    ).toBe(404);
  });

  it('the job mails a digest once, and a second pass the same day sends nothing', async () => {
    const u = await newUser();
    await call('PUT', `/api/watches/${A}`, u.cookie, { targetPrice: null });
    const job = startPriceWatchJob({
      db: ctx.db,
      mailer: ctx.mailer,
      webOrigin: 'https://perch.test',
      prices: fakePrices,
      intervalMs: 3_600_000,
      firstRunDelayMs: 3_600_000,
    });
    try {
      const before = ctx.mailer.sent.filter((m) => m.to === u.email).length;
      await job.runOnce();
      const mails = ctx.mailer.sent.filter((m) => m.to === u.email);
      expect(mails).toHaveLength(before + 1);
      expect(mails.at(-1)!.subject).toBe(`Watch route ${A} is on sale`);
      await job.runOnce();
      expect(ctx.mailer.sent.filter((m) => m.to === u.email)).toHaveLength(before + 1);
    } finally {
      job.stop();
    }
  });

  it('does not start a second pass while one is running', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const u = await newUser();
    await call('PUT', `/api/watches/${A}`, u.cookie, { targetPrice: null });
    const job = startPriceWatchJob({
      db: ctx.db,
      mailer: { async send() {} },
      webOrigin: 'https://perch.test',
      prices: {
        async findPrices() {
          await gate;
          return null;
        },
      },
      intervalMs: 3_600_000,
      firstRunDelayMs: 3_600_000,
    });
    try {
      const first = job.runOnce();
      expect(await job.runOnce()).toBeNull();
      release();
      await first;
    } finally {
      job.stop();
    }
  });
});
