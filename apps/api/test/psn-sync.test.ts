import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { hashPassword } from 'better-auth/crypto';
import { createVerifiedUser, type Game, type IgdbClient, type PsnApi } from '@perch/core';
import { schema } from '@perch/db';
import { cookieFrom, setupApi, testUrl } from './harness.js';

const PASSWORD = 'correct-horse-battery';
const WEB = 'http://localhost:5173';
const G1 = 987660001;
const G2 = 987660002;
const ACCOUNT = '5550777';
const ONLINE_ID = 'Perch_Test_Tag';
const ACCOUNT_B = '5550888';
const ONLINE_ID_B = 'Perch_Other_Tag';

const game = (igdbId: number): Game =>
  ({
    igdbId,
    name: `Psnsync ${igdbId}`,
    slug: `psnsync-${igdbId}`,
    genres: [12],
    themes: [],
    keywords: [],
    perspectives: [],
    gameModes: [],
    platforms: [167],
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
const NAMES: Record<string, number> = { 'Psnsync One': G1, 'Psnsync Two': G2 };

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
const playedGames = {
  titles: [
    {
      titleId: 'PPSA1_00',
      name: 'Psnsync One™',
      category: 'ps5_native_game',
      playDuration: 'PT3H30M',
      lastPlayedDateTime: recent,
    },
    {
      titleId: 'CUSA2_00',
      name: 'Psnsync Two',
      category: 'ps4_game',
      playDuration: 'PT20H',
      lastPlayedDateTime: '2020-01-01T00:00:00.000Z',
    },
    { titleId: 'CUSA3_00', name: 'Not On Igdb', category: 'ps4_game', playDuration: 'PT1H' },
    { titleId: 'PPSA4_00', name: 'Some App', category: 'ps5_native_media_app' },
  ],
  totalItemCount: 4,
  nextOffset: -1,
};

describe.skipIf(!testUrl)('psn library import', () => {
  let ctx: Awaited<ReturnType<typeof setupApi>>;
  let noKey: Awaited<ReturnType<typeof setupApi>>;
  let limited: Awaited<ReturnType<typeof setupApi>>;
  // Its server NPSSO goes dead, which switches PlayStation off for 15 minutes.
  let dead: Awaited<ReturnType<typeof setupApi>>;
  let calls: string[] = [];
  let mode: 'ok' | 'private' | 'busy' | 'down' | 'nobody' | 'authFailed' = 'ok';
  // Holds back the played games of ACCOUNT (the first account) until released, to overlap imports.
  let gate: Promise<void> | null = null;
  const IDS: Record<string, string> = {
    perch_test_tag: ONLINE_ID,
    perch_other_tag: ONLINE_ID_B,
  };
  const ACCOUNTS: Record<string, string> = { [ONLINE_ID]: ACCOUNT, [ONLINE_ID_B]: ACCOUNT_B };
  const psnApi: PsnApi = {
    async exchangeNpssoForAccessCode(npsso) {
      expect(npsso).toBe('test-npsso');
      calls.push('auth');
      if (mode === 'down') throw new TypeError('fetch failed');
      if (mode === 'authFailed')
        throw new Error(
          'There was a problem retrieving your PSN access code. Is your NPSSO code valid?',
        );
      return 'code';
    },
    async exchangeAccessCodeForAuthTokens() {
      return {
        accessToken: 'tok',
        expiresIn: 3600,
        refreshToken: 'r',
        refreshTokenExpiresIn: 99999,
      };
    },
    async exchangeRefreshTokenForAuthTokens() {
      throw new Error('unused');
    },
    async getProfileFromUserName(_auth, name) {
      calls.push(`profile:${name}`);
      const onlineId = IDS[name.toLowerCase()];
      if (mode === 'nobody' || !onlineId) throw new Error('Resource not found');
      return { profile: { onlineId, accountId: ACCOUNTS[onlineId]! } };
    },
    async getUserPlayedGames(_auth, accountId) {
      calls.push(`played:${accountId}`);
      if (gate && accountId === ACCOUNT) await gate;
      if (mode === 'down') throw new TypeError('fetch failed');
      if (mode === 'busy') throw new Error('Too many requests');
      if (mode === 'private') throw new Error('Access denied');
      return playedGames;
    },
  };

  beforeAll(async () => {
    const big = { limit: 100_000, windowMs: 60_000 };
    ctx = await setupApi(
      { api: big, auth: big },
      { PSN_NPSSO: 'test-npsso' },
      { igdb, psnApi, psnCooldownMs: 0 },
    );
    // The real one-minute throttle.
    limited = await setupApi(
      { api: big, auth: big },
      { PSN_NPSSO: 'test-npsso' },
      { igdb, psnApi },
    );
    noKey = await setupApi({ api: big, auth: big }, {}, { igdb, psnApi });
    dead = await setupApi(
      { api: big, auth: big },
      { PSN_NPSSO: 'test-npsso' },
      { igdb, psnApi, psnCooldownMs: 0 },
    );
  });
  afterAll(async () => {
    await ctx.db.delete(schema.games).where(inArray(schema.games.igdbId, [G1, G2]));
    await dead?.cleanup();
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
        .set({ psnAccountId: ACCOUNT, psnOnlineId: ONLINE_ID, psnSyncedAt: SYNCED_LONG_AGO })
        .where(eq(schema.users.id, id));
    const res = await c.app.request('/api/auth/sign-in/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: WEB },
      body: JSON.stringify({ email, password: PASSWORD }),
    });
    return { id, cookie: cookieFrom(res) };
  }
  const post = (c: typeof ctx, path: string, cookie?: string, body?: unknown) =>
    c.app.request(`/api/library/psn${path}`, {
      method: 'POST',
      headers: { ...(cookie ? { cookie } : {}), 'content-type': 'application/json', origin: WEB },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const link = (c: typeof ctx, cookie: string, onlineId = ONLINE_ID) =>
    post(c, '/link', cookie, { onlineId });
  const entries = (id: string) =>
    ctx.db.select().from(schema.libraryEntries).where(eq(schema.libraryEntries.userId, id));
  const userRow = async (id: string) =>
    (await ctx.db.select().from(schema.users).where(eq(schema.users.id, id)))[0]!;
  const account = async (cookie: string) =>
    (await ctx.app.request('/api/account', { headers: { cookie } })).json();

  it('requires a session', async () => {
    expect((await post(ctx, '/sync')).status).toBe(401);
    expect((await post(ctx, '/link', undefined, { onlineId: 'x' })).status).toBe(401);
  });

  it('answers 400 when no online ID is linked, and rejects a bad body', async () => {
    const u = await signedIn(ctx);
    const res = await post(ctx, '/sync', u.cookie);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'psn_not_linked' });
    expect((await post(ctx, '/link', u.cookie, { onlineId: '  ' })).status).toBe(400);
    const bad = await post(ctx, '/link', u.cookie, { onlineId: '../x?y' });
    expect(bad.status).toBe(400);
    expect(JSON.stringify(await bad.json())).toMatch(/3 to 16/);
    expect((await post(ctx, '/link', u.cookie, { onlineId: 'a'.repeat(17) })).status).toBe(400);
  });

  it('answers 503 psn_not_configured without an NPSSO and hides the PlayStation card', async () => {
    const u = await signedIn(noKey, true);
    for (const path of ['/sync', '/link']) {
      const res = await post(noKey, path, u.cookie, { onlineId: ONLINE_ID });
      expect(res.status).toBe(503);
      expect(await res.json()).toMatchObject({
        error: 'psn_not_configured',
        message: 'PlayStation import is unavailable right now.',
      });
    }
    const acct = await (
      await noKey.app.request('/api/account', { headers: { cookie: u.cookie } })
    ).json();
    expect(acct.psnSyncAvailable).toBe(false);
  });

  it('answers 503 when the server NPSSO has expired, and logs the admin alert', async () => {
    mode = 'authFailed';
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const u = await signedIn(dead, true);
      const res = await post(dead, '/sync', u.cookie);
      expect(res.status).toBe(503);
      expect(await res.json()).toMatchObject({ error: 'psn_not_configured' });
      expect(errors.mock.calls.some((c) => String(c[0]).includes('PSN_NPSSO expired'))).toBe(true);
    } finally {
      errors.mockRestore();
    }
  });

  it('after an auth failure PlayStation is off for 15 minutes: no calls, 503, not available', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      mode = 'authFailed';
      const u = await signedIn(dead, true);
      expect((await post(dead, '/sync', u.cookie)).status).toBe(503);
      mode = 'ok';
      calls = [];
      for (const [path, body] of [
        ['/sync', undefined],
        ['/link', { onlineId: ONLINE_ID }],
      ] as const) {
        const res = await post(dead, path, u.cookie, body);
        expect(res.status).toBe(503);
        expect(await res.json()).toMatchObject({ error: 'psn_not_configured' });
      }
      const acct = await (
        await dead.app.request('/api/account', { headers: { cookie: u.cookie } })
      ).json();
      expect(acct.psnSyncAvailable).toBe(false);
      await new Promise((r) => setTimeout(r, 30));
      expect(calls).toEqual([]); // not even the auto-sync of a stale link
      // Blocked requests do not use up the manual cooldown, and it lifts on its own.
      const later = Date.now() + 16 * 60_000;
      vi.setSystemTime(later);
      try {
        expect((await post(dead, '/sync', u.cookie)).status).toBe(200);
        expect((await account(u.cookie)).psnSyncAvailable).toBe(true);
      } finally {
        vi.useRealTimers();
      }
    } finally {
      errors.mockRestore();
    }
  });

  it('links by exact online ID, imports, and exposes the link on the account', async () => {
    mode = 'ok';
    const u = await signedIn(ctx);
    calls = [];
    const res = await link(ctx, u.cookie, 'perch_test_tag');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      imported: 2,
      updated: 0,
      unmatched: ['Not On Igdb'],
      unmatchedCount: 1,
      total: 3,
    });
    expect(calls.filter((c) => c !== 'auth')).toEqual([
      'profile:perch_test_tag',
      `played:${ACCOUNT}`,
    ]);
    const rows = await entries(u.id);
    expect(rows.map((r) => r.igdbId).sort()).toEqual([G1, G2]);
    expect(rows.find((r) => r.igdbId === G1)).toMatchObject({
      source: 'psn',
      platform: 'ps5',
      status: 'playing',
      hoursPlayed: 3.5,
    });
    expect(rows.find((r) => r.igdbId === G2)).toMatchObject({
      platform: 'ps4',
      status: 'backlog',
      hoursPlayed: 20,
      playedBeforePending: true,
    });
    expect(rows.find((r) => r.igdbId === G1)!.playedBeforePending).toBe(false);
    expect(await userRow(u.id)).toMatchObject({ psnAccountId: ACCOUNT, psnOnlineId: ONLINE_ID });
    expect(await account(u.cookie)).toMatchObject({
      psnOnlineId: ONLINE_ID,
      psnSyncedAt: expect.any(String),
      psnSyncAvailable: true,
    });
  });

  it('resyncs without a profile lookup thanks to the cached account id, updating not duplicating', async () => {
    mode = 'ok';
    const u = await signedIn(ctx);
    await link(ctx, u.cookie);
    calls = [];
    const again = await post(ctx, '/sync', u.cookie);
    expect(await again.json()).toMatchObject({ imported: 0, updated: 2 });
    expect(calls.filter((c) => c !== 'auth')).toEqual([`played:${ACCOUNT}`]);
    expect(await entries(u.id)).toHaveLength(2);
  });

  it('answers 404 psn_not_found for an unknown ID and links nothing', async () => {
    mode = 'nobody';
    const u = await signedIn(ctx);
    const res = await link(ctx, u.cookie);
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: 'psn_not_found' });
    expect((await userRow(u.id)).psnAccountId).toBeNull();
  });

  it('answers 409 psn_private with help text but keeps the link for a later resync', async () => {
    mode = 'private';
    const u = await signedIn(ctx);
    const res = await link(ctx, u.cookie);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('psn_private');
    expect(body.message).toMatch(/visible to anyone|set "Gaming history" to Anyone/i);
    expect(await entries(u.id)).toHaveLength(0);
    expect((await userRow(u.id)).psnAccountId).toBe(ACCOUNT);
  });

  it('answers 429 psn_busy at the rate limit and 502 when PlayStation is down', async () => {
    const u = await signedIn(ctx, true);
    mode = 'busy';
    const busy = await post(ctx, '/sync', u.cookie);
    expect(busy.status).toBe(429);
    expect(await busy.json()).toMatchObject({
      error: 'psn_busy',
      message: 'PlayStation sync is busy, try again later.',
    });
    mode = 'down';
    const down = await post(ctx, '/sync', u.cookie);
    expect(down.status).toBe(502);
    expect(await down.json()).toMatchObject({ error: 'psn_unavailable' });
  });

  it('unlinks: link and sync time go, imported games stay', async () => {
    mode = 'ok';
    const u = await signedIn(ctx);
    await link(ctx, u.cookie);
    const res = await ctx.app.request('/api/library/psn', {
      method: 'DELETE',
      headers: { cookie: u.cookie, origin: WEB },
    });
    expect(res.status).toBe(200);
    expect(await userRow(u.id)).toMatchObject({
      psnAccountId: null,
      psnOnlineId: null,
      psnSyncedAt: null,
    });
    expect(await entries(u.id)).toHaveLength(2);
    expect(await account(u.cookie)).toMatchObject({ psnOnlineId: null, psnSyncedAt: null });
  });

  it('auto-syncs off the request path on an account fetch, at most every 6 hours', async () => {
    mode = 'ok';
    const u = await signedIn(ctx, true);
    calls = [];
    expect((await ctx.app.request('/api/account', { headers: { cookie: u.cookie } })).status).toBe(
      200,
    );
    await vi.waitFor(async () => expect(await entries(u.id)).toHaveLength(2));
    expect(calls.filter((c) => c.startsWith('played'))).toHaveLength(1);
    for (let i = 0; i < 3; i++)
      await ctx.app.request('/api/account', { headers: { cookie: u.cookie } });
    await new Promise((r) => setTimeout(r, 50));
    expect(calls.filter((c) => c.startsWith('played'))).toHaveLength(1);
  });

  it('never lets an auto-sync failure reach the request, and gives the slot back', async () => {
    mode = 'down';
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const u = await signedIn(ctx, true);
      calls = [];
      expect(
        (await ctx.app.request('/api/account', { headers: { cookie: u.cookie } })).status,
      ).toBe(200);
      await vi.waitFor(async () => {
        expect(calls.length).toBeGreaterThan(0);
        expect((await userRow(u.id)).psnSyncedAt).toEqual(SYNCED_LONG_AGO);
      });
    } finally {
      errors.mockRestore();
    }
  });

  it('keeps "last synced" truthful when an auto-sync finds the history private or is rate limited', async () => {
    for (const m of ['private', 'busy'] as const) {
      mode = m;
      const u = await signedIn(ctx, true);
      calls = [];
      await ctx.app.request('/api/account', { headers: { cookie: u.cookie } });
      await vi.waitFor(() => expect(calls.length).toBeGreaterThan(0));
      await new Promise((r) => setTimeout(r, 50));
      expect((await userRow(u.id)).psnSyncedAt).toEqual(SYNCED_LONG_AGO);
      expect(await entries(u.id)).toHaveLength(0);
    }
  });

  it('does not auto-sync a link whose first import failed, so a retry is not blocked or hidden', async () => {
    mode = 'private';
    const u = await signedIn(ctx);
    expect((await link(ctx, u.cookie)).status).toBe(409);
    calls = [];
    for (let i = 0; i < 2; i++) {
      expect(await account(u.cookie)).toMatchObject({ psnOnlineId: ONLINE_ID, psnSyncedAt: null });
    }
    await new Promise((r) => setTimeout(r, 50));
    expect(calls).toHaveLength(0);
    mode = 'ok';
    expect((await post(ctx, '/sync', u.cookie)).status).toBe(200);
    expect((await account(u.cookie)).psnSyncedAt).toEqual(expect.any(String));
  });

  it('relinks to another online ID while an auto-sync for the old one runs, quietly', async () => {
    mode = 'ok';
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const u = await signedIn(ctx, true);
      let release!: () => void;
      gate = new Promise<void>((r) => (release = r));
      calls = [];
      await ctx.app.request('/api/account', { headers: { cookie: u.cookie } });
      await vi.waitFor(() => expect(calls).toContain(`played:${ACCOUNT}`));
      const res = await link(ctx, u.cookie, ONLINE_ID_B);
      expect(res.status).toBe(200);
      gate = null;
      release();
      await new Promise((r) => setTimeout(r, 100));
      expect(await userRow(u.id)).toMatchObject({
        psnAccountId: ACCOUNT_B,
        psnOnlineId: ONLINE_ID_B,
      });
      expect(await entries(u.id)).toHaveLength(2);
      expect(errors).not.toHaveBeenCalled();
    } finally {
      gate = null;
      errors.mockRestore();
    }
  });

  it('allows one manual PlayStation call per user per minute and answers 429 psn_cooldown after', async () => {
    mode = 'ok';
    const u = await signedIn(limited, true);
    const other = await signedIn(limited, true);
    expect((await post(limited, '/sync', u.cookie)).status).toBe(200);
    for (const res of [
      await post(limited, '/sync', u.cookie),
      await post(limited, '/link', u.cookie, { onlineId: ONLINE_ID }),
    ]) {
      expect(res.status).toBe(429);
      const body = await res.json();
      expect(body).toMatchObject({ error: 'psn_cooldown', message: 'Try again in a minute.' });
      expect(body.retryAfter).toBeGreaterThan(0);
      expect(body.retryAfter).toBeLessThanOrEqual(60);
      expect(Number(res.headers.get('retry-after'))).toBe(body.retryAfter);
    }
    expect((await post(limited, '/sync', other.cookie)).status).toBe(200);
    const unlinked = await signedIn(limited);
    expect((await post(limited, '/sync', unlinked.cookie)).status).toBe(400);
    expect((await post(limited, '/sync', unlinked.cookie)).status).toBe(400);
  });

  it('gives the manual attempt back when the online ID is not found', async () => {
    mode = 'nobody';
    const u = await signedIn(limited);
    expect((await link(limited, u.cookie)).status).toBe(404);
    expect((await link(limited, u.cookie)).status).toBe(404); // not a 429 cooldown
    mode = 'ok';
    expect((await link(limited, u.cookie)).status).toBe(200);
    expect((await link(limited, u.cookie)).status).toBe(429);
  });

  it('auto-sync tries a failing user at most once a minute', async () => {
    mode = 'down';
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const u = await signedIn(limited, true);
      calls = [];
      for (let i = 0; i < 4; i++) {
        await limited.app.request('/api/account', { headers: { cookie: u.cookie } });
        await new Promise((r) => setTimeout(r, 30));
      }
      expect(calls).toHaveLength(1);
    } finally {
      errors.mockRestore();
    }
  });
});
