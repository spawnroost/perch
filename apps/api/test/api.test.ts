import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { schema } from '@perch/db';
import { cookieFrom, json, linkIn, setupApi, testUrl } from './harness.js';

const PASSWORD = 'correct-horse-battery';

describe.skipIf(!testUrl)('api', () => {
  let ctx: Awaited<ReturnType<typeof setupApi>>;
  beforeAll(async () => {
    ctx = await setupApi();
  });
  afterAll(async () => {
    await ctx?.cleanup();
  });

  async function signUpVerified(email: string) {
    const signup = await ctx.app.request(
      '/api/auth/sign-up/email',
      json({ email, password: PASSWORD, name: 'T' }),
    );
    expect(signup.status).toBe(200);
    const mail = ctx.mailer.sent.findLast((m) => m.to === email)!;
    const verify = await ctx.app.request(
      new URL(linkIn(mail)).pathname + new URL(linkIn(mail)).search,
    );
    expect(verify.status).toBeLessThan(400);
  }

  async function login(email: string) {
    const res = await ctx.app.request(
      '/api/auth/sign-in/email',
      json({ email, password: PASSWORD }),
    );
    return res;
  }

  it('GET /api/health returns ok', async () => {
    const res = await ctx.app.request('/api/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('protected route rejects anonymous requests', async () => {
    expect((await ctx.app.request('/api/me')).status).toBe(401);
  });

  it('signup, verification link, login, then the session cookie opens a protected route', async () => {
    const email = ctx.newEmail();
    const signup = await ctx.app.request(
      '/api/auth/sign-up/email',
      json({ email, password: PASSWORD, name: 'T' }),
    );
    expect(signup.status).toBe(200);
    expect(signup.headers.getSetCookie()).toHaveLength(0); // no session until verified

    // login is refused before verification
    expect((await login(email)).status).toBe(403);

    const mail = ctx.mailer.sent.findLast((m) => m.to === email)!;
    expect(mail.subject.toLowerCase()).toContain('verify');
    const link = new URL(linkIn(mail));
    const verify = await ctx.app.request(link.pathname + link.search);
    expect(verify.status).toBeLessThan(400);
    const [row] = await ctx.db.select().from(schema.users).where(eq(schema.users.email, email));
    expect(row?.emailVerified).toBe(true);

    const res = await login(email);
    expect(res.status).toBe(200);
    const cookie = cookieFrom(res);
    expect(cookie).toContain('session_token');

    const me = await ctx.app.request('/api/me', { headers: { cookie } });
    expect(me.status).toBe(200);
    expect(await me.json()).toMatchObject({ id: row!.id, email });
  });

  it('password reset mails a link and the new password works', async () => {
    const email = ctx.newEmail();
    await signUpVerified(email);
    const req = await ctx.app.request(
      '/api/auth/request-password-reset',
      json({ email, redirectTo: 'http://localhost:5173/reset' }),
    );
    expect(req.status).toBe(200);
    const mail = ctx.mailer.sent.findLast((m) => m.to === email && /reset/i.test(m.subject))!;
    const link = new URL(linkIn(mail));
    const token = link.pathname.split('/').pop()!;
    const reset = await ctx.app.request(
      '/api/auth/reset-password',
      json({ newPassword: 'brand-new-password-1', token }),
    );
    expect(reset.status).toBe(200);
    const ok = await ctx.app.request(
      '/api/auth/sign-in/email',
      json({ email, password: 'brand-new-password-1' }),
    );
    expect(ok.status).toBe(200);
  });

  it('deleting the account removes the user and all their data', async () => {
    const email = ctx.newEmail();
    await signUpVerified(email);
    const res = await login(email);
    const cookie = cookieFrom(res);
    const [u] = await ctx.db.select().from(schema.users).where(eq(schema.users.email, email));
    const userId = u!.id;

    const igdbId = 2_000_000 + Math.floor(Math.random() * 1_000_000);
    await ctx.db.insert(schema.games).values({ igdbId, name: 'Hades', slug: `hades-${igdbId}` });
    await ctx.db.insert(schema.libraryEntries).values({ userId, igdbId, platform: 'pc' });
    await ctx.db.insert(schema.devices).values({ userId, kind: 'pc', name: 'Rig' });
    await ctx.db.insert(schema.feedback).values({ userId, igdbId, kind: 'up' });
    await ctx.db.insert(schema.tasteProfiles).values({ userId });

    const del = await ctx.app.request('/api/auth/delete-user', {
      ...json({ password: PASSWORD }),
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost:5173',
        cookie,
      },
    });
    expect(del.status).toBe(200);

    const count = async (
      t:
        | typeof schema.devices
        | typeof schema.libraryEntries
        | typeof schema.feedback
        | typeof schema.tasteProfiles
        | typeof schema.sessions
        | typeof schema.accounts,
    ) => (await ctx.db.select().from(t).where(eq(t.userId, userId))).length;
    expect(
      await ctx.db.select().from(schema.users).where(eq(schema.users.id, userId)),
    ).toHaveLength(0);
    for (const t of [
      schema.devices,
      schema.libraryEntries,
      schema.feedback,
      schema.tasteProfiles,
      schema.sessions,
      schema.accounts,
    ]) {
      expect(await count(t)).toBe(0);
    }
    await ctx.db.delete(schema.games).where(eq(schema.games.igdbId, igdbId));
  });
});

describe.skipIf(!testUrl)('api rate limiting', () => {
  it('returns 429 with Retry-After once the limit is spent', async () => {
    const ctx = await setupApi({
      api: { limit: 2, windowMs: 60_000 },
      auth: { limit: 100, windowMs: 60_000 },
    });
    try {
      expect((await ctx.app.request('/api/health')).status).toBe(200);
      expect((await ctx.app.request('/api/health')).status).toBe(200);
      const res = await ctx.app.request('/api/health');
      expect(res.status).toBe(429);
      expect(Number(res.headers.get('retry-after'))).toBeGreaterThan(0);
    } finally {
      await ctx.cleanup();
    }
  });

  it('applies the stricter auth limit to /api/auth/*', async () => {
    const ctx = await setupApi({
      api: { limit: 100, windowMs: 60_000 },
      auth: { limit: 2, windowMs: 60_000 },
    });
    try {
      const bad = json({ email: 'x@test.dev', password: 'whatever-pass' });
      await ctx.app.request('/api/auth/sign-in/email', bad);
      await ctx.app.request('/api/auth/sign-in/email', bad);
      expect((await ctx.app.request('/api/auth/sign-in/email', bad)).status).toBe(429);
      expect((await ctx.app.request('/api/health')).status).toBe(200);
    } finally {
      await ctx.cleanup();
    }
  });
});
