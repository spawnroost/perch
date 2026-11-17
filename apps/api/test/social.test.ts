import { afterAll, describe, expect, it } from 'vitest';
import { parseEnv, parseServerEnv } from '../src/env.js';
import { setupApi, testEnv, testUrl } from './harness.js';

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
