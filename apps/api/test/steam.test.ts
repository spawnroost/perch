import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { hashPassword } from 'better-auth/crypto';
import { STEAM_OPENID_ENDPOINT, createVerifiedUser } from '@perch/core';
import { schema } from '@perch/db';
import { cookieFrom, setupApi, testUrl } from './harness.js';
import type { SteamOpenIdVerifier } from '../src/steam-openid.js';

const PASSWORD = 'correct-horse-battery';
const rnd = () => String(76561198000000000n + BigInt(Math.floor(Math.random() * 1e9)));
const WEB = 'http://localhost:5173';

describe.skipIf(!testUrl)('steam openid', () => {
  let ctx: Awaited<ReturnType<typeof setupApi>>;
  let valid = true;
  const verifier: SteamOpenIdVerifier = { verify: async () => valid };
  const steamIds: string[] = [];
  const newSteamId = () => {
    const id = rnd();
    steamIds.push(id);
    return id;
  };

  beforeAll(async () => {
    const big = { limit: 100_000, windowMs: 60_000 };
    ctx = await setupApi({ api: big, auth: big }, {}, { steamOpenId: verifier });
  });
  afterAll(async () => {
    if (steamIds.length)
      await ctx.db.delete(schema.users).where(inArray(schema.users.steamId, steamIds));
    await ctx?.cleanup();
  });

  const call = (path: string, cookie?: string, method = 'GET') =>
    ctx.app.request(path, { method, headers: cookie ? { cookie } : {} });

  async function passwordUser() {
    const email = ctx.newEmail();
    const { id } = await createVerifiedUser(ctx.db, { email, password: PASSWORD }, hashPassword);
    const res = await ctx.app.request('/api/auth/sign-in/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: WEB },
      body: JSON.stringify({ email, password: PASSWORD }),
    });
    return { id, cookie: cookieFrom(res) };
  }

  /** Runs /start and returns the state cookie plus a callback URL as Steam would send it. */
  async function begin(mode: 'login' | 'link', steamId: string, sessionCookie?: string) {
    const start = await call(`/api/auth/steam/start?mode=${mode}`, sessionCookie);
    expect(start.status).toBe(302);
    const loc = new URL(start.headers.get('location')!);
    expect(loc.origin + loc.pathname).toBe(STEAM_OPENID_ENDPOINT);
    const returnTo = loc.searchParams.get('openid.return_to')!;
    const stateCookie = cookieFrom(start);
    const q = new URLSearchParams({
      'openid.ns': 'http://specs.openid.net/auth/2.0',
      'openid.mode': 'id_res',
      'openid.op_endpoint': STEAM_OPENID_ENDPOINT,
      'openid.claimed_id': `https://steamcommunity.com/openid/id/${steamId}`,
      'openid.identity': `https://steamcommunity.com/openid/id/${steamId}`,
      'openid.return_to': returnTo,
      'openid.signed': 'signed',
      'openid.sig': 'x',
    });
    const cb = new URL(returnTo);
    return {
      callbackPath: `${cb.pathname}?${cb.searchParams.toString()}&${q.toString()}`,
      cookie: [stateCookie, sessionCookie].filter(Boolean).join('; '),
    };
  }

  const dest = (res: Response) => new URL(res.headers.get('location')!);

  it('creates a user and a session on first Steam login', async () => {
    valid = true;
    const steamId = newSteamId();
    const { callbackPath, cookie } = await begin('login', steamId);
    const res = await call(callbackPath, cookie);
    expect(res.status).toBe(302);
    expect(dest(res).href).toBe(`${WEB}/`);
    const [user] = await ctx.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.steamId, steamId));
    expect(user?.email).toBe(`${steamId}@steam.perch.invalid`);
    expect(user?.emailVerified).toBe(true);
    const me = await call('/api/account', cookieFrom(res));
    expect(me.status).toBe(200);
    expect(await me.json()).toMatchObject({ steamId, hasPassword: false });
  });

  it('signs a returning Steam user into the same account', async () => {
    valid = true;
    const steamId = newSteamId();
    const a = await begin('login', steamId);
    const first = await call(a.callbackPath, a.cookie);
    const b = await begin('login', steamId);
    const second = await call(b.callbackPath, b.cookie);
    expect(dest(second).href).toBe(`${WEB}/`);
    expect(cookieFrom(second)).toContain('session_token');
    const rows = await ctx.db.select().from(schema.users).where(eq(schema.users.steamId, steamId));
    expect(rows).toHaveLength(1);
    const [m1, m2] = await Promise.all([
      call('/api/account', cookieFrom(first)),
      call('/api/account', cookieFrom(second)),
    ]);
    expect(m1.status).toBe(200);
    expect(m2.status).toBe(200);
  });

  it('links Steam to a signed-in user', async () => {
    valid = true;
    const u = await passwordUser();
    const steamId = newSteamId();
    const { callbackPath, cookie } = await begin('link', steamId, u.cookie);
    const res = await call(callbackPath, cookie);
    expect(dest(res).href).toBe(`${WEB}/account`);
    const me = await call('/api/account', u.cookie);
    expect(await me.json()).toMatchObject({ steamId, hasPassword: true });
  });

  it('refuses to link a Steam id that belongs to another user', async () => {
    valid = true;
    const steamId = newSteamId();
    const a = await passwordUser();
    const b = await passwordUser();
    for (const [u, expected] of [
      [a, `${WEB}/account`],
      [b, `${WEB}/account?steamError=conflict`],
    ] as const) {
      const { callbackPath, cookie } = await begin('link', steamId, u.cookie);
      expect(dest(await call(callbackPath, cookie)).href).toBe(expected);
    }
    const [row] = await ctx.db.select().from(schema.users).where(eq(schema.users.id, b.id));
    expect(row?.steamId).toBeNull();
  });

  it('link needs a session', async () => {
    const res = await call('/api/auth/steam/start?mode=link');
    expect(dest(res).searchParams.get('steamError')).toBe('auth');
  });

  it('rejects a bad or missing state', async () => {
    valid = true;
    const { callbackPath, cookie } = await begin('login', newSteamId());
    const noCookie = await call(callbackPath);
    expect(dest(noCookie).searchParams.get('steamError')).toBe('state');
    const wrong = await call(callbackPath.replace(/state=[^&]+/, 'state=nope'), cookie);
    expect(dest(wrong).searchParams.get('steamError')).toBe('state');
  });

  it('state is single use', async () => {
    valid = true;
    const steamId = newSteamId();
    const { callbackPath, cookie } = await begin('login', steamId);
    const ok = await call(callbackPath, cookie);
    expect(dest(ok).searchParams.get('steamError')).toBeNull();
    // Replaying with the original (now cleared) cookie value is only possible if the server
    // had not expired it; check the server told the browser to drop it.
    expect(ok.headers.getSetCookie().some((c) => /perch_steam_state=;|Max-Age=0/i.test(c))).toBe(
      true,
    );
  });

  it('rejects an assertion Steam says is invalid', async () => {
    valid = false;
    const steamId = newSteamId();
    const { callbackPath, cookie } = await begin('login', steamId);
    const res = await call(callbackPath, cookie);
    expect(dest(res).searchParams.get('steamError')).toBe('invalid');
    expect(res.headers.getSetCookie().some((c) => c.includes('session_token'))).toBe(false);
    const rows = await ctx.db.select().from(schema.users).where(eq(schema.users.steamId, steamId));
    expect(rows).toHaveLength(0);
    valid = true;
  });

  it('refuses to unlink when the user has no password', async () => {
    valid = true;
    const steamId = newSteamId();
    const { callbackPath, cookie } = await begin('login', steamId);
    const login = await call(callbackPath, cookie);
    const res = await call('/api/account/steam/unlink', cookieFrom(login), 'POST');
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'Steam is your only sign-in method.' });
    const [row] = await ctx.db.select().from(schema.users).where(eq(schema.users.steamId, steamId));
    expect(row).toBeDefined();
  });

  it('unlinks for a user with a password', async () => {
    valid = true;
    const u = await passwordUser();
    const steamId = newSteamId();
    const { callbackPath, cookie } = await begin('link', steamId, u.cookie);
    await call(callbackPath, cookie);
    await ctx.db
      .update(schema.users)
      .set({ steamSyncedAt: new Date() })
      .where(eq(schema.users.id, u.id));
    const res = await call('/api/account/steam/unlink', u.cookie, 'POST');
    expect(res.status).toBe(200);
    const [after] = await ctx.db.select().from(schema.users).where(eq(schema.users.id, u.id));
    expect(after?.steamSyncedAt).toBeNull();
    const me = await call('/api/account', u.cookie);
    expect(await me.json()).toMatchObject({ steamId: null });
  });

  it('never mails placeholder addresses on password reset', async () => {
    valid = true;
    const steamId = newSteamId();
    const { callbackPath, cookie } = await begin('login', steamId);
    await call(callbackPath, cookie);
    const before = ctx.mailer.sent.length;
    await ctx.app.request('/api/auth/request-password-reset', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: WEB },
      body: JSON.stringify({ email: `${steamId}@steam.perch.invalid`, redirectTo: `${WEB}/reset` }),
    });
    expect(ctx.mailer.sent.length).toBe(before);
  });

  it('handles two concurrent first-time logins for one Steam id', async () => {
    valid = true;
    const steamId = newSteamId();
    const [a, b] = await Promise.all([begin('login', steamId), begin('login', steamId)]);
    const [ra, rb] = await Promise.all([
      call(a.callbackPath, a.cookie),
      call(b.callbackPath, b.cookie),
    ]);
    for (const r of [ra, rb]) {
      expect(dest(r).href).toBe(`${WEB}/`);
      expect(cookieFrom(r)).toContain('session_token');
    }
    const rows = await ctx.db.select().from(schema.users).where(eq(schema.users.steamId, steamId));
    expect(rows).toHaveLength(1);
  });

  it('refuses email signup for reserved .invalid addresses', async () => {
    const res = await ctx.app.request('/api/auth/sign-up/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: WEB },
      body: JSON.stringify({
        name: 'Squatter',
        email: `${newSteamId()}@steam.perch.invalid`,
        password: PASSWORD,
      }),
    });
    expect(res.status).toBe(400);
    const none = await ctx.db.select().from(schema.users).where(eq(schema.users.name, 'Squatter'));
    expect(none).toHaveLength(0);
  });

  it('lets a Steam-only user delete their account with a fresh session, no password', async () => {
    valid = true;
    const steamId = newSteamId();
    const { callbackPath, cookie } = await begin('login', steamId);
    const login = await call(callbackPath, cookie);
    const res = await ctx.app.request('/api/auth/delete-user', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: WEB,
        cookie: cookieFrom(login),
      },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
    const rows = await ctx.db.select().from(schema.users).where(eq(schema.users.steamId, steamId));
    expect(rows).toHaveLength(0);
  });

  it('records the request user agent on the Steam session', async () => {
    valid = true;
    const steamId = newSteamId();
    const { callbackPath, cookie } = await begin('login', steamId);
    const res = await ctx.app.request(callbackPath, {
      headers: { cookie, 'user-agent': 'steam-test-agent' },
    });
    expect(res.status).toBe(302);
    const [u] = await ctx.db.select().from(schema.users).where(eq(schema.users.steamId, steamId));
    const rows = await ctx.db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.userId, u!.id));
    expect(rows[0]?.userAgent).toBe('steam-test-agent');
  });
});

describe.skipIf(!testUrl)('steam openid rate limit', () => {
  it('puts the Steam redirects in the strict auth bucket', async () => {
    const ctx = await setupApi(
      { api: { limit: 100_000, windowMs: 60_000 }, auth: { limit: 2, windowMs: 60_000 } },
      {},
      { steamOpenId: { verify: async () => true } },
    );
    try {
      const statuses: number[] = [];
      for (let i = 0; i < 3; i++) {
        statuses.push((await ctx.app.request('/api/auth/steam/start?mode=login')).status);
      }
      expect(statuses).toEqual([302, 302, 429]);
    } finally {
      await ctx.cleanup();
    }
  });
});
