import { describe, expect, it } from 'vitest';
import { checkLimit, clientKey, createLimiter } from '../src/rate-limit.js';

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
  it('prefers the user id, else the first forwarded IP, else the socket address', () => {
    expect(clientKey({ userId: 'u1', forwardedFor: '1.1.1.1' })).toBe('user:u1');
    expect(clientKey({ forwardedFor: ' 9.9.9.9 , 2.2.2.2' })).toBe('ip:9.9.9.9');
    expect(clientKey({ remoteAddress: '::1' })).toBe('ip:::1');
    expect(clientKey({})).toBe('ip:unknown');
  });
});
