import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import type { AppVars } from '../src/app.js';
import type { Auth } from '../src/auth.js';
import { requireAuth, resolveSession } from '../src/middleware.js';
import { checkLimit, clientKey, createLimiter, rateLimit } from '../src/rate-limit.js';

describe('checkLimit', () => {
  const rule = { limit: 3, windowMs: 1000 };

  it('allows up to the limit then blocks with retry-after', () => {
    let state;
    for (let i = 0; i < 3; i++) {
      const r = checkLimit(state, 0, rule);
      expect(r.allowed).toBe(true);
      expect(r.remaining).toBe(2 - i);
      state = r.state;
    }
    const blocked = checkLimit(state, 400, rule);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterSec).toBe(1);
  });

  it('starts a new window once the old one has elapsed', () => {
    let state = checkLimit(undefined, 0, { limit: 1, windowMs: 1000 }).state;
    expect(checkLimit(state, 999, { limit: 1, windowMs: 1000 }).allowed).toBe(false);
    const r = checkLimit(state, 1000, { limit: 1, windowMs: 1000 });
    expect(r.allowed).toBe(true);
    state = r.state;
    expect(state.windowStart).toBe(1000);
  });
});

describe('createLimiter', () => {
  it('tracks keys independently', () => {
    const l = createLimiter({ limit: 1, windowMs: 1000 });
    expect(l.hit('a', 0).allowed).toBe(true);
    expect(l.hit('a', 1).allowed).toBe(false);
    expect(l.hit('b', 1).allowed).toBe(true);
  });

  it('evicts expired keys', () => {
    const l = createLimiter({ limit: 1, windowMs: 1000 });
    l.hit('a', 0);
    l.hit('b', 0);
    expect(l.size()).toBe(2);
    l.sweep(5000);
    expect(l.size()).toBe(0);
  });
});

describe('clientKey', () => {
  it('prefers the user id, else the socket address', () => {
    expect(clientKey({ userId: 'u1', forwardedFor: '1.1.1.1' })).toBe('user:u1');
    expect(clientKey({ remoteAddress: '::1' })).toBe('ip:::1');
    expect(clientKey({})).toBe('ip:unknown');
  });

  it('ignores X-Forwarded-For unless the proxy is trusted', () => {
    expect(clientKey({ forwardedFor: '9.9.9.9', remoteAddress: '10.0.0.1' })).toBe('ip:10.0.0.1');
    expect(
      clientKey({ forwardedFor: '9.9.9.9', remoteAddress: '10.0.0.1', trustProxy: false }),
    ).toBe('ip:10.0.0.1');
  });

  it('uses the rightmost hop when trusted, falling back to the socket', () => {
    expect(clientKey({ forwardedFor: ' 6.6.6.6 , 2.2.2.2 ', trustProxy: true })).toBe('ip:2.2.2.2');
    expect(clientKey({ remoteAddress: '10.0.0.1', trustProxy: true })).toBe('ip:10.0.0.1');
  });
});

describe('session resolution', () => {
  function build(getSession: (a: { headers: Headers }) => Promise<unknown>) {
    const auth = { api: { getSession } } as unknown as Auth;
    const app = new Hono<AppVars>();
    app.use('/api/*', resolveSession({ auth }));
    app.use(
      '/api/*',
      rateLimit(
        { api: { limit: 100, windowMs: 1000 }, auth: { limit: 100, windowMs: 1000 } },
        { trustProxy: false },
      ),
    );
    app.get('/api/me', requireAuth(), (c) => c.json({ id: c.get('user').id }));
    app.post('/api/auth/sign-in/email', (c) => c.json({ ok: true }));
    return app;
  }

  it('does one lookup per request for a recognised cookie, shared by limiter and requireAuth', async () => {
    const getSession = vi.fn(async () => ({ user: { id: 'u1' } }));
    const res = await build(getSession).request('/api/me', {
      headers: { cookie: 'better-auth.session_token=abc' },
    });
    expect(await res.json()).toEqual({ id: 'u1' });
    expect(getSession).toHaveBeenCalledTimes(1);
  });

  it('does no lookup without a better-auth session cookie, and 401s', async () => {
    const getSession = vi.fn(async () => ({ user: { id: 'u1' } }));
    const app = build(getSession);
    expect((await app.request('/api/me')).status).toBe(401);
    expect((await app.request('/api/me', { headers: { cookie: 'theme=dark' } })).status).toBe(401);
    expect(getSession).not.toHaveBeenCalled();
  });

  it('does no lookup for credential POSTs to /api/auth/*', async () => {
    const getSession = vi.fn(async () => null);
    const res = await build(getSession).request('/api/auth/sign-in/email', {
      method: 'POST',
      headers: { cookie: 'better-auth.session_token=abc' },
    });
    expect(res.status).toBe(200);
    expect(getSession).not.toHaveBeenCalled();
  });
});
