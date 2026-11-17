import { afterAll, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { schema } from '@perch/db';
import { createAuth } from '../src/auth.js';
import { parseEnv, parseServerEnv } from '../src/env.js';
import { cookieFrom, setupApi, testEnv, testUrl } from './harness.js';

const BASE = {
  BETTER_AUTH_SECRET: 'test-secret-test-secret-test-secret',
  BETTER_AUTH_URL: 'http://localhost:8787',
  WEB_ORIGIN: 'http://localhost:5173',
};

describe('social provider env', () => {
  it('accepts neither, or both of a pair', () => {
    expect(() => parseEnv(BASE)).not.toThrow();
    expect(() =>
      parseEnv({ ...BASE, GOOGLE_CLIENT_ID: 'a', GOOGLE_CLIENT_SECRET: 'b' }),
    ).not.toThrow();
    expect(() =>
      parseEnv({ ...BASE, DISCORD_CLIENT_ID: '', DISCORD_CLIENT_SECRET: '' }),
    ).not.toThrow();
  });
  it('fails fast when only one of a pair is set', () => {
    expect(() => parseEnv({ ...BASE, GOOGLE_CLIENT_ID: 'a' })).toThrow(/GOOGLE_CLIENT_ID/);
    expect(() => parseEnv({ ...BASE, DISCORD_CLIENT_SECRET: 'b' })).toThrow(/DISCORD_CLIENT_ID/);
    expect(() =>
      parseServerEnv({ ...BASE, DATABASE_URL: 'postgres://x', DISCORD_CLIENT_SECRET: 'b' }),
    ).toThrow(/DISCORD/);
  });
});

describe.skipIf(!testUrl)('auth providers endpoint', () => {
  const cleanups: Array<() => Promise<void>> = [];
  afterAll(async () => {
    for (const c of cleanups) await c();
  });

  it('reports only Steam when nothing is configured (public, no secrets)', async () => {
    const t = await setupApi();
    cleanups.push(t.cleanup);
    const res = await t.app.request('/api/auth-providers');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ google: false, discord: false, steam: true });
  });

  it('reports configured providers without leaking credentials', async () => {
    const t = await setupApi(undefined, {
      GOOGLE_CLIENT_ID: 'gid',
      GOOGLE_CLIENT_SECRET: 'super-secret-g',
      DISCORD_CLIENT_ID: 'did',
      DISCORD_CLIENT_SECRET: 'super-secret-d',
    });
    cleanups.push(t.cleanup);
    const res = await t.app.request('/api/auth-providers');
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ google: true, discord: true, steam: true });
    expect(text).not.toMatch(/secret|gid|did/);
  });

  it('only registers the configured provider with better-auth', async () => {
    const t = await setupApi(undefined, { DISCORD_CLIENT_ID: 'did', DISCORD_CLIENT_SECRET: 's' });
    cleanups.push(t.cleanup);
    const body = JSON.stringify({ provider: 'discord', callbackURL: testEnv.WEB_ORIGIN });
    const headers = { 'content-type': 'application/json', origin: testEnv.WEB_ORIGIN };
    const ok = await t.app.request('/api/auth/sign-in/social', { method: 'POST', headers, body });
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { url: string }).url).toContain(
      'discord.com/api/oauth2/authorize',
    );
    const bad = await t.app.request('/api/auth/sign-in/social', {
      method: 'POST',
      headers,
      body: JSON.stringify({ provider: 'google', callbackURL: testEnv.WEB_ORIGIN }),
    });
    expect(bad.status).toBeGreaterThanOrEqual(400);
  });
});

describe.skipIf(!testUrl)('oauth identity gate', () => {
  it('wires the email gate into every configured provider', async () => {
    const t = await setupApi();
    try {
      const { createAuth } = await import('../src/auth.js');
      const env = {
        ...testEnv,
        GOOGLE_CLIENT_ID: 'g',
        GOOGLE_CLIENT_SECRET: 'g',
        DISCORD_CLIENT_ID: 'd',
        DISCORD_CLIENT_SECRET: 'd',
      };
      const ctx = await createAuth(t.db, env, t.mailer).$context;
      for (const id of ['google', 'discord']) {
        const map = (
          ctx.socialProviders.find((p) => p.id === id)?.options as {
            mapProfileToUser?: (p: object) => unknown;
          }
        ).mapProfileToUser;
        expect(map).toBeTypeOf('function');
        expect(map!({ email: 'a@b.dev', verified: true, email_verified: true })).toEqual({});
        expect(map!({ email: 'a@b.dev', verified: false, email_verified: false })).toMatchObject({
          emailVerified: false,
        });
        expect(map!({ email: 'x@steam.perch.invalid', verified: true })).toHaveProperty(
          'email',
          undefined,
        );
      }
      const ctx2 = await createAuth(t.db, testEnv, t.mailer).$context;
      expect(ctx2.socialProviders).toHaveLength(0);
    } finally {
      await t.cleanup();
    }
  });
});

const DISCORD_ENV = { DISCORD_CLIENT_ID: 'd', DISCORD_CLIENT_SECRET: 'd' };
const GOOGLE_ENV = { GOOGLE_CLIENT_ID: 'g', GOOGLE_CLIENT_SECRET: 'g' };

describe.skipIf(!testUrl)('linking a provider to a Steam-only user', () => {
  it('allows linking with a different email', async () => {
    const t = await setupApi();
    try {
      const ctx = await createAuth(t.db, { ...testEnv, ...DISCORD_ENV }, t.mailer).$context;
      expect(ctx.options.account?.accountLinking?.allowDifferentEmails).toBe(true);
      expect(ctx.options.account?.accountLinking?.trustedProviders).toEqual(['google', 'discord']);
    } finally {
      await t.cleanup();
    }
  });

  async function steamUser(
    t: Awaited<ReturnType<typeof setupApi>>,
    auth: ReturnType<typeof createAuth>,
  ) {
    const steamId = String(76561198000000000n + BigInt(Math.floor(Math.random() * 1e9)));
    const ctx = await auth.$context;
    const user = await ctx.internalAdapter.createUser(
      { email: `${steamId}@steam.perch.invalid`, emailVerified: true, name: 'Steam user', steamId },
      { method: 'steam-openid' },
    );
    return { ctx, userId: user.id };
  }

  async function linkDiscord(
    ctx: Awaited<ReturnType<ReturnType<typeof createAuth>['$context']>>,
    userId: string,
    email: string,
    accountId: string,
  ) {
    const map = (
      ctx.socialProviders.find((p) => p.id === 'discord')?.options as {
        mapProfileToUser: (p: object) => unknown;
      }
    ).mapProfileToUser;
    map({ id: accountId, email, verified: true });
    await ctx.internalAdapter.createAccount({ userId, providerId: 'discord', accountId });
  }

  const emailOf = async (t: Awaited<ReturnType<typeof setupApi>>, id: string) =>
    (await t.db.select().from(schema.users).where(eq(schema.users.id, id)))[0];

  it('replaces the .invalid placeholder with the verified provider email', async () => {
    const t = await setupApi();
    const ids: string[] = [];
    try {
      const auth = createAuth(t.db, { ...testEnv, ...DISCORD_ENV }, t.mailer);
      const { ctx, userId } = await steamUser(t, auth);
      ids.push(userId);
      const email = t.newEmail();
      await linkDiscord(ctx, userId, email, `d-${crypto.randomUUID()}`);
      const user = await emailOf(t, userId);
      expect(user?.email).toBe(email);
      expect(user?.emailVerified).toBe(true);
    } finally {
      await t.db.delete(schema.users).where(inArray(schema.users.id, ids));
      await t.cleanup();
    }
  });

  it('keeps the placeholder when another user already owns the email', async () => {
    const t = await setupApi();
    const ids: string[] = [];
    try {
      const auth = createAuth(t.db, { ...testEnv, ...DISCORD_ENV }, t.mailer);
      const { ctx, userId } = await steamUser(t, auth);
      ids.push(userId);
      const owned = t.newEmail();
      await ctx.internalAdapter.createUser({ email: owned, emailVerified: true, name: 'Owner' });
      await linkDiscord(ctx, userId, owned, `d-${crypto.randomUUID()}`);
      expect((await emailOf(t, userId))?.email).toMatch(/\.invalid$/);
    } finally {
      await t.db.delete(schema.users).where(inArray(schema.users.id, ids));
      await t.cleanup();
    }
  });

  it('does not touch a real email', async () => {
    const t = await setupApi();
    try {
      const auth = createAuth(t.db, { ...testEnv, ...DISCORD_ENV }, t.mailer);
      const ctx = await auth.$context;
      const mine = t.newEmail();
      const user = await ctx.internalAdapter.createUser({
        email: mine,
        emailVerified: true,
        name: 'Me',
      });
      await linkDiscord(ctx, user.id, t.newEmail(), `d-${crypto.randomUUID()}`);
      expect((await emailOf(t, user.id))?.email).toBe(mine);
    } finally {
      await t.cleanup();
    }
  });
});

describe.skipIf(!testUrl)('unlinking Steam counts only enabled social logins', () => {
  it('needs a currently configured provider, and /api/account lists only those', async () => {
    const big = { limit: 100_000, windowMs: 60_000 };
    const steamOpenId = { verify: async () => true };
    const on = await setupApi({ api: big, auth: big }, GOOGLE_ENV, { steamOpenId });
    const off = await setupApi({ api: big, auth: big }, {}, { steamOpenId });
    const steamId = String(76561198000000000n + BigInt(Math.floor(Math.random() * 1e9)));
    try {
      const start = await on.app.request('/api/auth/steam/start?mode=login');
      const returnTo = new URL(start.headers.get('location')!).searchParams.get(
        'openid.return_to',
      )!;
      const q = new URLSearchParams({
        'openid.mode': 'id_res',
        'openid.op_endpoint': 'https://steamcommunity.com/openid/login',
        'openid.claimed_id': `https://steamcommunity.com/openid/id/${steamId}`,
        'openid.return_to': returnTo,
      });
      const cb = new URL(returnTo);
      const login = await on.app.request(`${cb.pathname}?${cb.searchParams}&${q}`, {
        headers: { cookie: cookieFrom(start) },
      });
      const cookie = cookieFrom(login);
      const [user] = await on.db
        .select()
        .from(schema.users)
        .where(eq(schema.users.steamId, steamId));
      await on.db.insert(schema.accounts).values({
        id: crypto.randomUUID(),
        accountId: 'g-1',
        providerId: 'google',
        userId: user!.id,
      });
      const get = (a: typeof on) => a.app.request('/api/account', { headers: { cookie } });
      expect(await (await get(on)).json()).toMatchObject({ linkedProviders: ['google'] });
      expect(await (await get(off)).json()).toMatchObject({ linkedProviders: [] });
      const unlink = (a: typeof on) =>
        a.app.request('/api/account/steam/unlink', { method: 'POST', headers: { cookie } });
      expect((await unlink(off)).status).toBe(409);
      expect((await unlink(on)).status).toBe(200);
    } finally {
      await on.db.delete(schema.users).where(eq(schema.users.steamId, steamId));
      await on.cleanup();
      await off.cleanup();
    }
  });
});
