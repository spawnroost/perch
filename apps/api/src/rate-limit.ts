import { createMiddleware } from 'hono/factory';
import { getConnInfo } from '@hono/node-server/conninfo';
import type { AppVars } from './app.js';
import { isAuthPost, isSteamAuthGet } from './http.js';

export interface RateRule {
  limit: number;
  windowMs: number;
}

export interface WindowState {
  windowStart: number;
  count: number;
}

export interface LimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
  state: WindowState;
}

/** Pure fixed-window check: given the key's previous state and the time, returns the verdict. */
export function checkLimit(
  prev: WindowState | undefined,
  now: number,
  { limit, windowMs }: RateRule,
): LimitResult {
  const state: WindowState =
    prev && now - prev.windowStart < windowMs ? { ...prev } : { windowStart: now, count: 0 };
  const retryAfterSec = Math.max(1, Math.ceil((state.windowStart + windowMs - now) / 1000));
  if (state.count >= limit) return { allowed: false, remaining: 0, retryAfterSec, state };
  state.count++;
  return { allowed: true, remaining: limit - state.count, retryAfterSec, state };
}

/** In-memory limiter: one fixed window per key. Single-process only. */
export function createLimiter(rule: RateRule) {
  const states = new Map<string, WindowState>();
  return {
    hit(key: string, now = Date.now()): LimitResult {
      const res = checkLimit(states.get(key), now, rule);
      states.set(key, res.state);
      return res;
    },
    sweep(now = Date.now()) {
      for (const [k, s] of states) if (now - s.windowStart >= rule.windowMs) states.delete(k);
    },
    size: () => states.size,
  };
}

/**
 * User id when signed in, else the client IP. X-Forwarded-For is spoofable, so it is only read
 * when `trustProxy` is set, and then only its rightmost hop (the one our own proxy appended).
 */
export function clientKey(p: {
  userId?: string | undefined;
  forwardedFor?: string | undefined;
  remoteAddress?: string | undefined;
  trustProxy?: boolean | undefined;
}): string {
  if (p.userId) return `user:${p.userId}`;
  const hop = p.trustProxy ? p.forwardedFor?.split(',').at(-1)?.trim() : undefined;
  return `ip:${hop || p.remoteAddress || 'unknown'}`;
}

export interface RateLimitConfig {
  /** Everything under /api except POST /api/auth/*. */
  api: RateRule;
  /** POST /api/auth/* and the Steam sign-in redirects; stricter, always keyed by IP. */
  auth: RateRule;
}

export const DEFAULT_RATE_LIMITS: RateLimitConfig = {
  api: { limit: 120, windowMs: 60_000 },
  auth: { limit: 20, windowMs: 60_000 },
};

/** Runs after `resolveSession`; reads the user it stored on the context. */
export function rateLimit(config: RateLimitConfig, { trustProxy }: { trustProxy: boolean }) {
  const api = createLimiter(config.api);
  const auth = createLimiter(config.auth);
  const timer = setInterval(() => {
    api.sweep();
    auth.sweep();
  }, 60_000);
  timer.unref();

  return createMiddleware<AppVars>(async (c, next) => {
    // Only credential-handling POSTs (sign-in, sign-up, reset, ...) get the strict bucket.
    const isAuth = isAuthPost(c) || isSteamAuthGet(c);
    let remoteAddress: string | undefined;
    try {
      remoteAddress = getConnInfo(c).remote.address;
    } catch {
      // no socket (tests via app.request)
    }
    const key = clientKey({
      userId: isAuth ? undefined : c.get('sessionUser')?.id,
      forwardedFor: c.req.header('x-forwarded-for'),
      remoteAddress,
      trustProxy,
    });
    const res = (isAuth ? auth : api).hit(key);
    c.header('X-RateLimit-Remaining', String(res.remaining));
    if (!res.allowed) {
      c.header('Retry-After', String(res.retryAfterSec));
      return c.json({ error: 'rate limit exceeded' }, 429);
    }
    await next();
  });
}
