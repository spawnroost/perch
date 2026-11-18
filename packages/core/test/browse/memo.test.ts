import { describe, expect, it, vi } from 'vitest';
import { memoizeTagQuery } from '../../src/browse/memo.js';

const q = (genres: number[], themes: number[] = []) => ({
  genres,
  themes,
  minRatingCount: 50,
  limit: 300,
  match: 'all' as const,
});

describe('memoizeTagQuery', () => {
  it('reuses an answer for the same tags within the ttl, whatever the id order', async () => {
    let t = 0;
    const fn = vi.fn(async () => []);
    const m = memoizeTagQuery(fn, { ttlMs: 1000, now: () => t });
    await m(q([2, 1]));
    await m(q([1, 2]));
    expect(fn).toHaveBeenCalledTimes(1);
    await m(q([1], [3]));
    expect(fn).toHaveBeenCalledTimes(2);
    t = 1001;
    await m(q([1, 2]));
    expect(fn).toHaveBeenCalledTimes(3);
  });
  it('does not keep a failed call', async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValue([]);
    const m = memoizeTagQuery(fn);
    await expect(m(q([1]))).rejects.toThrow('x');
    await expect(m(q([1]))).resolves.toEqual([]);
  });
});
