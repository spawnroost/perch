import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { hashPassword } from 'better-auth/crypto';
import { createVerifiedUser, type Game, type IgdbClient } from '@perch/core';
import { schema } from '@perch/db';
import { cookieFrom, setupApi, testUrl } from './harness.js';

const PASSWORD = 'correct-horse-battery';
const WEB = 'http://localhost:5173';
const G1 = 987658001;
const G2 = 987658002;
const XUID = '2533274800777';
const GAMERTAG = 'Perch Test Tag';
const XUID_B = '2533274800888';
const GAMERTAG_B = 'Perch Other Tag';

const game = (igdbId: number): Game =>
  ({
    igdbId,
    name: `Steamsync ${igdbId}`,
    slug: `steamsync-${igdbId}`,
    genres: [12],
    themes: [],
    keywords: [],
    perspectives: [],
    gameModes: [],
    platforms: [6],
    similarIds: [],
    series: [],
    coverUrl: null,
    coverUrlSmall: null,
    heroUrl: null,
    accent: null,
    summary: null,
    firstRelease: null,
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
  }) as Game;

const SYNCED_LONG_AGO = new Date(Date.now() - 7 * 3_600_000);
const NAMES: Record<string, number> = { 'Xboxsync One': G1, 'Xboxsync Two': G2 };

const igdb: IgdbClient = {
  async searchGames() {
    return { best: null, candidates: [] };
  },
  async getGame(id) {
    return [G1, G2].includes(id) ? game(id) : null;
  },
  async getGames(ids) {
    return ids.filter((i) => [G1, G2].includes(i)).map(game);
  },
  async queryByTags() {
    return [];
  },
  async getTimeToBeat() {
    return null;
  },
  async externalGameIds() {
    return new Map();
  },
  async gamesByExactName(names) {
    return names
      .filter((n) => NAMES[n])
      .map((n) => ({ igdbId: NAMES[n]!, name: n, gameType: 0, firstRelease: null }));
  },
  async keywordNames() {
    return {};
  },
  async steamAppIds() {
    return new Map();
  },
};

const recent = new Date(Date.now() - 86_400_000).toISOString();
const titleHistory = {
  content: {
    xuid: XUID,
    titles: [
      {
        titleId: '1',
        name: 'Xboxsync One®',
        type: 'Game',
        devices: ['XboxSeries'],
        titleHistory: { lastTimePlayed: recent, visible: true },
      },
      {
        titleId: '2',
        name: 'Xboxsync Two (PC)',
        type: 'Game',
        devices: ['PC'],
        titleHistory: { lastTimePlayed: '2020-01-01T00:00:00.0000000Z', visible: true },
        achievement: { progressPercentage: 30 },
      },
      { titleId: '3', name: 'Not On Igdb', type: 'Game', devices: ['XboxOne'] },
      { titleId: '4', name: 'Some App', type: 'App', devices: ['XboxOne'] },
    ],
  },
};

describe.skipIf(!testUrl)('xbox library import', () => {
  let ctx: Awaited<ReturnType<typeof setupApi>>;
  let noKey: Awaited<ReturnType<typeof setupApi>>;
  let limited: Awaited<ReturnType<typeof setupApi>>;
  let calls: string[] = [];
  let mode: 'ok' | 'private' | 'busy' | 'down' | 'nobody' | 'emptySearch' = 'ok';
  // Holds back the history of XUID (the first account) until released, to overlap imports.
  let gate: Promise<void> | null = null;
  const xboxFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push(url);
    expect((init?.headers as Record<string, string>)['X-Authorization']).toBe('test-key');
    if (mode === 'down') throw new TypeError('fetch failed');
    if (mode === 'busy') return new Response('', { status: 429 });
    if (url.includes('/search/')) {
      if (mode === 'emptySearch') return new Response('');
      const people =
        mode === 'nobody'
          ? [{ xuid: '9', gamertag: 'Someone Else' }]
          : [
              { xuid: '8', gamertag: 'Perch Test Tag Fan' },
              { xuid: XUID, gamertag: GAMERTAG, modernGamertag: GAMERTAG },
              { xuid: XUID_B, gamertag: GAMERTAG_B, modernGamertag: GAMERTAG_B },
            ];
      return new Response(JSON.stringify({ content: { people } }));
    }
    if (gate && url.endsWith(`/${XUID}`)) await gate;
    if (mode === 'private') return new Response('');
    return new Response(JSON.stringify(titleHistory));
  }) as unknown as typeof fetch;

  beforeAll(async () => {
    const big = { limit: 100_000, windowMs: 60_000 };
    ctx = await setupApi(
      { api: big, auth: big },
      { OPENXBL_API_KEY: 'test-key' },
      { igdb, xboxFetch, xboxCooldownMs: 0 },
    );
    // The real one-minute throttle.
    limited = await setupApi(
      { api: big, auth: big },
      { OPENXBL_API_KEY: 'test-key' },
      { igdb, xboxFetch },
    );
    noKey = await setupApi({ api: big, auth: big }, {}, { igdb, xboxFetch });
  });
  afterAll(async () => {
    await ctx.db.delete(schema.games).where(inArray(schema.games.igdbId, [G1, G2]));
    await limited?.cleanup();
    await noKey?.cleanup();
    await ctx?.cleanup();
  });

  async function signedIn(c: typeof ctx, linked = false) {
    const email = c.newEmail();
    const { id } = await createVerifiedUser(c.db, { email, password: PASSWORD }, hashPassword);
    if (linked)
      await c.db
        .update(schema.users)
        .set({ xboxXuid: XUID, xboxGamertag: GAMERTAG, xboxSyncedAt: SYNCED_LONG_AGO })
        .where(eq(schema.users.id, id));
    const res = await c.app.request('/api/auth/sign-in/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: WEB },
      body: JSON.stringify({ email, password: PASSWORD }),
    });
    return { id, cookie: cookieFrom(res) };
  }
  const post = (c: typeof ctx, path: string, cookie?: string, body?: unknown) =>
    c.app.request(`/api/library/xbox${path}`, {
      method: 'POST',
      headers: { ...(cookie ? { cookie } : {}), 'content-type': 'application/json', origin: WEB },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const link = (c: typeof ctx, cookie: string, gamertag = GAMERTAG) =>
    post(c, '/link', cookie, { gamertag });
  const entries = (id: string) =>
    ctx.db.select().from(schema.libraryEntries).where(eq(schema.libraryEntries.userId, id));
  const userRow = async (id: string) =>
    (await ctx.db.select().from(schema.users).where(eq(schema.users.id, id)))[0]!;
  const account = async (cookie: string) =>
    (await ctx.app.request('/api/account', { headers: { cookie } })).json();

  it('requires a session', async () => {
    expect((await post(ctx, '/sync')).status).toBe(401);
    expect((await post(ctx, '/link', undefined, { gamertag: 'x' })).status).toBe(401);
  });

  it('answers 400 when no gamertag is linked, and rejects a bad body', async () => {
    const u = await signedIn(ctx);
    const res = await post(ctx, '/sync', u.cookie);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'xbox_not_linked' });
    expect((await post(ctx, '/link', u.cookie, { gamertag: '  ' })).status).toBe(400);
  });

  it('answers 503 xbox_not_configured without a key and hides the Xbox card', async () => {
    const u = await signedIn(noKey, true);
    for (const path of ['/sync', '/link']) {
      const res = await post(noKey, path, u.cookie, { gamertag: GAMERTAG });
      expect(res.status).toBe(503);
      expect(await res.json()).toMatchObject({ error: 'xbox_not_configured' });
    }
    const acct = await (
      await noKey.app.request('/api/account', { headers: { cookie: u.cookie } })
    ).json();
    expect(acct.xboxSyncAvailable).toBe(false);
  });

  it('links by exact gamertag, imports, and exposes the link on the account', async () => {
    mode = 'ok';
    const u = await signedIn(ctx);
    calls = [];
    const res = await link(ctx, u.cookie, 'perch test tag');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      imported: 2,
      updated: 0,
      unmatched: ['Not On Igdb'],
      unmatchedCount: 1,
      total: 3,
    });
    expect(calls).toHaveLength(2);
    const rows = await entries(u.id);
    expect(rows.map((r) => r.igdbId).sort()).toEqual([G1, G2]);
    expect(rows.find((r) => r.igdbId === G1)).toMatchObject({
      source: 'xbox',
      platform: 'xbox',
      status: 'playing',
      hoursPlayed: null,
    });
    expect(rows.find((r) => r.igdbId === G2)).toMatchObject({
      platform: 'pc',
      status: 'backlog',
      playedBeforePending: true,
    });
    expect(rows.find((r) => r.igdbId === G1)!.playedBeforePending).toBe(false);
    const row = await userRow(u.id);
    expect(row).toMatchObject({ xboxXuid: XUID, xboxGamertag: GAMERTAG });
    expect(await account(u.cookie)).toMatchObject({
      xboxGamertag: GAMERTAG,
      xboxSyncedAt: expect.any(String),
      xboxSyncAvailable: true,
    });
  });

  it('resyncs with one request thanks to the cached xuid, updating instead of duplicating', async () => {
    mode = 'ok';
    const u = await signedIn(ctx);
    await link(ctx, u.cookie);
    calls = [];
    const again = await post(ctx, '/sync', u.cookie);
    expect(await again.json()).toMatchObject({ imported: 0, updated: 2 });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain(`/player/titleHistory/${XUID}`);
    expect(await entries(u.id)).toHaveLength(2);
  });

  it('answers 404 xbox_not_found for a near miss and links nothing', async () => {
    mode = 'nobody';
    const u = await signedIn(ctx);
    const res = await link(ctx, u.cookie);
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: 'xbox_not_found' });
    expect((await userRow(u.id)).xboxXuid).toBeNull();
  });

  it('answers 409 xbox_private with help text but keeps the link for a later resync', async () => {
    mode = 'private';
    const u = await signedIn(ctx);
    const res = await link(ctx, u.cookie);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('xbox_private');
    expect(body.message).toMatch(/game history/i);
    expect(await entries(u.id)).toHaveLength(0);
    expect((await userRow(u.id)).xboxXuid).toBe(XUID);
  });

  it('answers 429 xbox_busy at the rate limit and 502 when OpenXBL is down', async () => {
    const u = await signedIn(ctx, true);
    mode = 'busy';
    const busy = await post(ctx, '/sync', u.cookie);
    expect(busy.status).toBe(429);
    expect(await busy.json()).toMatchObject({
      error: 'xbox_busy',
      message: 'Xbox sync is busy, try again later.',
    });
    mode = 'down';
    const down = await post(ctx, '/sync', u.cookie);
    expect(down.status).toBe(502);
    expect(await down.json()).toMatchObject({ error: 'xbox_unavailable' });
  });

  it('unlinks: link and sync time go, imported games stay', async () => {
    mode = 'ok';
    const u = await signedIn(ctx);
    await link(ctx, u.cookie);
    const res = await ctx.app.request('/api/library/xbox', {
      method: 'DELETE',
      headers: { cookie: u.cookie, origin: WEB },
    });
    expect(res.status).toBe(200);
    expect(await userRow(u.id)).toMatchObject({
      xboxXuid: null,
      xboxGamertag: null,
      xboxSyncedAt: null,
    });
    expect(await entries(u.id)).toHaveLength(2);
    expect(await account(u.cookie)).toMatchObject({ xboxGamertag: null, xboxSyncedAt: null });
  });

  it('auto-syncs off the request path on an account fetch, at most every 6 hours', async () => {
    mode = 'ok';
    const u = await signedIn(ctx, true);
    calls = [];
    expect((await ctx.app.request('/api/account', { headers: { cookie: u.cookie } })).status).toBe(
      200,
    );
    await vi.waitFor(async () => expect(await entries(u.id)).toHaveLength(2));
    expect(calls).toHaveLength(1);
    for (let i = 0; i < 3; i++)
      await ctx.app.request('/api/account', { headers: { cookie: u.cookie } });
    await new Promise((r) => setTimeout(r, 50));
    expect(calls).toHaveLength(1);
  });

  it('never lets an auto-sync failure reach the request, and retries on the next fetch', async () => {
    mode = 'down';
    const u = await signedIn(ctx, true);
    calls = [];
    expect((await ctx.app.request('/api/account', { headers: { cookie: u.cookie } })).status).toBe(
      200,
    );
    await vi.waitFor(async () => {
      expect(calls.length).toBeGreaterThan(0);
      expect((await userRow(u.id)).xboxSyncedAt).toEqual(SYNCED_LONG_AGO);
    });
  });

  it('keeps "last synced" truthful when an auto-sync finds the history private or is rate limited', async () => {
    for (const m of ['private', 'busy'] as const) {
      mode = m;
      const u = await signedIn(ctx, true);
      calls = [];
      await ctx.app.request('/api/account', { headers: { cookie: u.cookie } });
      await vi.waitFor(() => expect(calls.length).toBeGreaterThan(0));
      await new Promise((r) => setTimeout(r, 50));
      expect((await userRow(u.id)).xboxSyncedAt).toEqual(SYNCED_LONG_AGO);
      expect(await entries(u.id)).toHaveLength(0);
    }
  });

  it('does not auto-sync a link whose first import failed, so a retry is not blocked or hidden', async () => {
    mode = 'private';
    const u = await signedIn(ctx);
    expect((await link(ctx, u.cookie)).status).toBe(409);
    calls = [];
    for (let i = 0; i < 2; i++) {
      const acct = await account(u.cookie);
      expect(acct).toMatchObject({ xboxGamertag: GAMERTAG, xboxSyncedAt: null });
    }
    await new Promise((r) => setTimeout(r, 50));
    expect(calls).toHaveLength(0);
    // Fixing the privacy setting and syncing by hand works.
    mode = 'ok';
    expect((await post(ctx, '/sync', u.cookie)).status).toBe(200);
    expect((await account(u.cookie)).xboxSyncedAt).toEqual(expect.any(String));
  });

  it('relinks to another gamertag while an auto-sync for the old one runs, quietly', async () => {
    mode = 'ok';
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const u = await signedIn(ctx, true);
      let release!: () => void;
      gate = new Promise<void>((r) => (release = r));
      calls = [];
      await ctx.app.request('/api/account', { headers: { cookie: u.cookie } });
      await vi.waitFor(() => expect(calls.some((c) => c.endsWith(`/${XUID}`))).toBe(true));
      const res = await link(ctx, u.cookie, GAMERTAG_B);
      expect(res.status).toBe(200);
      gate = null;
      release();
      await new Promise((r) => setTimeout(r, 100));
      expect(await userRow(u.id)).toMatchObject({ xboxXuid: XUID_B, xboxGamertag: GAMERTAG_B });
      expect(await entries(u.id)).toHaveLength(2);
      expect(errors).not.toHaveBeenCalled();
    } finally {
      gate = null;
      errors.mockRestore();
    }
  });

  it('answers 502, not "private", when the gamertag search itself comes back empty', async () => {
    mode = 'emptySearch';
    const u = await signedIn(ctx);
    const res = await link(ctx, u.cookie);
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ error: 'xbox_unavailable' });
  });

  it('allows one manual Xbox call per user per minute and answers 429 xbox_cooldown after', async () => {
    mode = 'ok';
    const u = await signedIn(limited, true);
    const other = await signedIn(limited, true);
    expect((await post(limited, '/sync', u.cookie)).status).toBe(200);
    for (const res of [
      await post(limited, '/sync', u.cookie),
      await post(limited, '/link', u.cookie, { gamertag: GAMERTAG }),
    ]) {
      expect(res.status).toBe(429);
      const body = await res.json();
      expect(body).toMatchObject({ error: 'xbox_cooldown', message: 'Try again in a minute.' });
      expect(body.retryAfter).toBeGreaterThan(0);
      expect(body.retryAfter).toBeLessThanOrEqual(60);
      expect(Number(res.headers.get('retry-after'))).toBe(body.retryAfter);
    }
    // Another user, and a request that never reaches OpenXBL, are not throttled.
    expect((await post(limited, '/sync', other.cookie)).status).toBe(200);
    const unlinked = await signedIn(limited);
    expect((await post(limited, '/sync', unlinked.cookie)).status).toBe(400);
    expect((await post(limited, '/sync', unlinked.cookie)).status).toBe(400);
  });

  it('auto-sync tries a failing user at most once a minute', async () => {
    mode = 'down';
    const u = await signedIn(limited, true);
    calls = [];
    for (let i = 0; i < 4; i++) {
      await limited.app.request('/api/account', { headers: { cookie: u.cookie } });
      await new Promise((r) => setTimeout(r, 30));
    }
    expect(calls).toHaveLength(1);
  });
});
