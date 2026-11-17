import { describe, expect, it } from 'vitest';
import {
  PROVISIONAL_MAX_AGE_MS,
  RECOMMENDATION_CACHE_MAX_AGE_MS,
  computedAtFor,
  isFresh,
  isSettled,
  recommendationCacheKey,
} from '../../src/recommendation-cache/index.js';

describe('recommendationCacheKey', () => {
  it('treats a missing device as "all"', () => {
    expect(recommendationCacheKey({ limit: 20 })).toBe(
      recommendationCacheKey({ device: 'all', limit: 20 }),
    );
  });

  it('keeps device ids and kinds case-sensitive, as selectDevices is', () => {
    expect(recommendationCacheKey({ device: 'ps5', limit: 5 })).not.toBe(
      recommendationCacheKey({ device: 'PS5', limit: 5 }),
    );
    expect(recommendationCacheKey({ device: 'ALL', limit: 5 })).not.toBe(
      recommendationCacheKey({ limit: 5 }),
    );
  });

  it('separates different devices and limits', () => {
    const keys = new Set([
      recommendationCacheKey({ device: 'ps5', limit: 20 }),
      recommendationCacheKey({ device: 'ps5', limit: 5 }),
      recommendationCacheKey({ device: 'none', limit: 20 }),
      recommendationCacheKey({ limit: 20 }),
    ]);
    expect(keys.size).toBe(4);
  });

  it('keeps device ids (uuids) distinct', () => {
    const a = recommendationCacheKey({ device: '3f2a0000-0000-4000-8000-000000000001', limit: 20 });
    const b = recommendationCacheKey({ device: '3f2a0000-0000-4000-8000-000000000002', limit: 20 });
    expect(a).not.toBe(b);
  });
});

describe('isFresh', () => {
  const now = new Date('2026-01-01T12:00:00Z');
  const ago = (ms: number) => new Date(now.getTime() - ms);

  it('defaults to 6 hours', () => {
    expect(RECOMMENDATION_CACHE_MAX_AGE_MS).toBe(6 * 60 * 60 * 1000);
    expect(isFresh(ago(5 * 3600_000), now)).toBe(true);
    expect(isFresh(ago(7 * 3600_000), now)).toBe(false);
  });

  it('is stale at exactly the max age', () => {
    expect(isFresh(ago(1000), now, 1000)).toBe(false);
    expect(isFresh(ago(999), now, 1000)).toBe(true);
  });

  it('treats a timestamp in the future (clock skew) as fresh', () => {
    expect(isFresh(new Date(now.getTime() + 5000), now)).toBe(true);
  });
});

const pick = (accent: string | null, timeToBeat: object | null, coverUrl: string | null = 'c') => ({
  game: { coverUrl, accent },
  timeToBeat,
});

describe('isSettled', () => {
  const ttb = { hastily: 1, normally: 2, completely: 3 };

  it('is true when every cover has an accent and time-to-beat is known', () => {
    expect(isSettled([pick('#fff', ttb)], { requireTimeToBeat: true })).toBe(true);
  });

  it('is false while an accent is still being fetched', () => {
    expect(isSettled([pick(null, ttb)], { requireTimeToBeat: false })).toBe(false);
  });

  it('ignores accents for games without a cover', () => {
    expect(isSettled([pick(null, ttb, null)], { requireTimeToBeat: true })).toBe(true);
  });

  it('only waits for time-to-beat when asked to', () => {
    expect(isSettled([pick('#fff', null)], { requireTimeToBeat: true })).toBe(false);
    expect(isSettled([pick('#fff', null)], { requireTimeToBeat: false })).toBe(true);
  });

  it('treats an empty list as settled', () => {
    expect(isSettled([], { requireTimeToBeat: true })).toBe(true);
  });
});

describe('computedAtFor', () => {
  const now = new Date('2026-01-01T12:00:00Z');

  it('stamps settled results with now', () => {
    expect(computedAtFor(now, true)).toEqual(now);
  });

  it('backdates unsettled results so they expire after the provisional window', () => {
    const at = computedAtFor(now, false);
    expect(isFresh(at, now)).toBe(true);
    expect(isFresh(at, new Date(now.getTime() + PROVISIONAL_MAX_AGE_MS - 1))).toBe(true);
    expect(isFresh(at, new Date(now.getTime() + PROVISIONAL_MAX_AGE_MS))).toBe(false);
  });
});
