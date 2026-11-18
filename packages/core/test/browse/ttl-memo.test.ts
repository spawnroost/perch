import { describe, expect, it, vi } from 'vitest';
import { createTtlMemo } from '../../src/browse/ttl-memo.js';

describe('createTtlMemo', () => {
  it('reuses an answer within the ttl and remakes it after', async () => {
    let t = 0;
    const make = vi.fn(async () => t);
    const memo = createTtlMemo<number>({ ttlMs: 1000, now: () => t });
    expect(await memo.get('a', make)).toBe(0);
    t = 999;
    expect(await memo.get('a', make)).toBe(0);
    expect(make).toHaveBeenCalledTimes(1);
    t = 1000;
    expect(await memo.get('a', make)).toBe(1000);
    expect(make).toHaveBeenCalledTimes(2);
  });

  it('shares one in-flight make between concurrent callers', async () => {
    const make = vi.fn(async () => 1);
    const memo = createTtlMemo<number>();
    await Promise.all([memo.get('a', make), memo.get('a', make)]);
    expect(make).toHaveBeenCalledTimes(1);
  });

  it('drops an expired entry on read, even when the remake fails', async () => {
    let t = 0;
    const memo = createTtlMemo<number>({ ttlMs: 10, now: () => t });
    await memo.get('a', async () => 1);
    t = 11;
    await expect(
      memo.get('a', async () => {
        throw new Error('x');
      }),
    ).rejects.toThrow('x');
    const make = vi.fn(async () => 2);
    expect(await memo.get('a', make)).toBe(2);
    expect(make).toHaveBeenCalledTimes(1);
  });

  it('evicts the least recently used entry past max, and a read refreshes recency', async () => {
    const memo = createTtlMemo<number>({ max: 2 });
    await memo.get('a', async () => 1);
    await memo.get('b', async () => 2);
    await memo.get('a', async () => 99); // touch a: b is now the oldest
    await memo.get('c', async () => 3); // evicts b
    const again = vi.fn(async () => 20);
    expect(await memo.get('b', again)).toBe(20);
    expect(again).toHaveBeenCalledTimes(1);
    const kept = vi.fn(async () => 0);
    expect(await memo.get('c', kept)).toBe(3);
    expect(kept).not.toHaveBeenCalled();
  });

  it('does not keep a failed call', async () => {
    const make = vi.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValue(5);
    const memo = createTtlMemo<number>();
    await expect(memo.get('a', make)).rejects.toThrow('x');
    await expect(memo.get('a', make)).resolves.toBe(5);
  });
});
