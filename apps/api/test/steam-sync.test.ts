import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { hashPassword } from 'better-auth/crypto';
import { createVerifiedUser, type Game, type IgdbClient } from '@perch/core';
import { schema } from '@perch/db';
import { cookieFrom, setupApi, testUrl } from './harness.js';
import type { SteamOpenIdVerifier } from '../src/steam-openid.js';

const PASSWORD = 'correct-horse-battery';
const WEB = 'http://localhost:5173';
const G1 = 987657001;
const G2 = 987657002;
const APP1 = 7001;
const APP2 = 7002;
const APP3 = 7003; // not on IGDB
const rnd = () => String(76561198100000000n + BigInt(Math.floor(Math.random() * 1e9)));

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
  }) as Game;

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
  async keywordNames() {
    return {};
  },
  async steamAppIds(appids) {
    const all = new Map([
      [APP1, G1],
      [APP2, G2],
    ]);
    return new Map([...all].filter(([a]) => appids.includes(a)));
  },
};

describe.skipIf(!testUrl)('steam library sync', () => {
  let ctx: Awaited<ReturnType<typeof setupApi>>;
  let noKey: Awaited<ReturnType<typeof setupApi>>;
  let steamCalls = 0;
  let mode: 'ok' | 'private' | 'down' = 'ok';
  const steamFetch = (async () => {
    steamCalls++;
    if (mode === 'down') throw new TypeError('fetch failed');
    if (mode === 'private') return new Response(JSON.stringify({ response: {} }));
    return new Response(
      JSON.stringify({
        response: {
          game_count: 3,
          games: [
            { appid: APP1, playtime_forever: 90, rtime_last_played: 1_700_000_000 },
            { appid: APP2, playtime_forever: 0, rtime_last_played: 0 },
            { appid: APP3, playtime_forever: 5, rtime_last_played: 0 },
          ],
        },
      }),
    );
  }) as unknown as typeof fetch;
  const valid: SteamOpenIdVerifier = { verify: async () => true };
  const steamIds: string[] = [];

  beforeAll(async () => {
    const big = { limit: 100_000, windowMs: 60_000 };
    ctx = await setupApi(
      { api: big, auth: big },
      { STEAM_API_KEY: 'test-key' },
      { igdb, steamFetch, steamOpenId: valid },
    );
    noKey = await setupApi({ api: big, auth: big }, {}, { igdb, steamFetch });
  });
  afterAll(async () => {
    if (steamIds.length)
      await ctx.db.delete(schema.users).where(inArray(schema.users.steamId, steamIds));
    await ctx.db.delete(schema.games).where(inArray(schema.games.igdbId, [G1, G2]));
    await ctx.db
      .delete(schema.steamAppMap)
      .where(inArray(schema.steamAppMap.appid, [APP1, APP2, APP3]));
    await noKey?.cleanup();
    await ctx?.cleanup();
  });

  async function signedIn(c: typeof ctx, withSteam: boolean) {
    const email = c.newEmail();
    const { id } = await createVerifiedUser(c.db, { email, password: PASSWORD }, hashPassword);
    if (withSteam) {
      const steamId = rnd();
      steamIds.push(steamId);
      await c.db.update(schema.users).set({ steamId }).where(eq(schema.users.id, id));
    }
    const res = await c.app.request('/api/auth/sign-in/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: WEB },
      body: JSON.stringify({ email, password: PASSWORD }),
    });
    return { id, cookie: cookieFrom(res) };
  }
  const sync = (c: typeof ctx, cookie?: string) =>
    c.app.request('/api/library/steam/sync', { method: 'POST', headers: cookie ? { cookie } : {} });
  const entries = (id: string) =>
    ctx.db.select().from(schema.libraryEntries).where(eq(schema.libraryEntries.userId, id));

  it('requires a session', async () => {
    expect((await sync(ctx)).status).toBe(401);
  });

  it('answers 400 when Steam is not linked', async () => {
    const u = await signedIn(ctx, false);
    const res = await sync(ctx, u.cookie);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'steam_not_linked' });
  });

  it('answers 503 steam_not_configured without a key', async () => {
    const u = await signedIn(noKey, true);
    const res = await sync(noKey, u.cookie);
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: 'steam_not_configured' });
  });

  it('imports the library and reports counts and the sync time', async () => {
    mode = 'ok';
    const u = await signedIn(ctx, true);
    const res = await sync(ctx, u.cookie);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ imported: 2, updated: 0, unmatched: 1, total: 3 });
    const rows = await entries(u.id);
    expect(rows.map((r) => r.igdbId).sort()).toEqual([G1, G2]);
    expect(rows.find((r) => r.igdbId === G1)).toMatchObject({ source: 'steam', hoursPlayed: 1.5 });
    const acct = await (
      await ctx.app.request('/api/account', { headers: { cookie: u.cookie } })
    ).json();
    expect(acct.steamSyncedAt).toEqual(expect.any(String));
    expect(acct.steamSyncAvailable).toBe(true);
    // A second sync updates instead of duplicating.
    const again = await (await sync(ctx, u.cookie)).json();
    expect(again).toMatchObject({ imported: 0, updated: 2 });
    expect(await entries(u.id)).toHaveLength(2);
  });

  it('answers 409 steam_profile_private with help text', async () => {
    mode = 'private';
    const u = await signedIn(ctx, true);
    const res = await sync(ctx, u.cookie);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('steam_profile_private');
    expect(body.message).toMatch(/Privacy Settings.*Game details.*Public/s);
    expect(await entries(u.id)).toHaveLength(0);
  });

  it('answers 502 when Steam is unreachable', async () => {
    mode = 'down';
    const u = await signedIn(ctx, true);
    const res = await sync(ctx, u.cookie);
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ error: 'steam_unavailable' });
  });

  it('auto-syncs off the request path on an account fetch, at most every 6 hours', async () => {
    mode = 'ok';
    const u = await signedIn(ctx, true);
    steamCalls = 0;
    const res = await ctx.app.request('/api/account', { headers: { cookie: u.cookie } });
    expect(res.status).toBe(200);
    await vi.waitFor(async () => expect(await entries(u.id)).toHaveLength(2));
    expect(steamCalls).toBe(1);
    // Fresh sync: later fetches never call Steam again.
    for (let i = 0; i < 3; i++)
      await ctx.app.request('/api/account', { headers: { cookie: u.cookie } });
    await new Promise((r) => setTimeout(r, 50));
    expect(steamCalls).toBe(1);
  });

  it('does not sync from ordinary requests', async () => {
    mode = 'ok';
    const u = await signedIn(ctx, true);
    steamCalls = 0;
    for (let i = 0; i < 3; i++) await ctx.app.request('/api/me', { headers: { cookie: u.cookie } });
    await new Promise((r) => setTimeout(r, 50));
    expect(steamCalls).toBe(0);
  });

  it('never lets an auto-sync failure reach the request, and retries on the next fetch', async () => {
    mode = 'down';
    const u = await signedIn(ctx, true);
    const res = await ctx.app.request('/api/account', { headers: { cookie: u.cookie } });
    expect(res.status).toBe(200);
    await vi.waitFor(async () => {
      const [row] = await ctx.db.select().from(schema.users).where(eq(schema.users.id, u.id));
      expect(steamCalls).toBeGreaterThan(0);
      expect(row?.steamSyncedAt).toBeNull();
    });
  });
});
