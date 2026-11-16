import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RateQueue } from '../../src/igdb/queue.js';

describe('RateQueue', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('starts at most 4 requests per second', async () => {
    const queue = new RateQueue(4);
    const t0 = Date.now();
    const starts: number[] = [];
    const jobs = Array.from({ length: 9 }, () =>
      queue.schedule(async () => {
        starts.push(Date.now() - t0);
      }),
    );
    await vi.advanceTimersByTimeAsync(5000);
    await Promise.all(jobs);
    expect(starts).toEqual([0, 250, 500, 750, 1000, 1250, 1500, 1750, 2000]);
    // No 1-second window contains more than 4 starts.
    for (const s of starts) {
      expect(starts.filter((x) => x >= s && x < s + 1000).length).toBeLessThanOrEqual(4);
    }
  });

  it('does not delay a request after an idle period', async () => {
    const queue = new RateQueue(4);
    await queue.schedule(async () => {});
    await vi.advanceTimersByTimeAsync(10_000);
    const t = Date.now();
    let started = -1;
    const job = queue.schedule(async () => {
      started = Date.now();
    });
    await vi.advanceTimersByTimeAsync(0);
    await job;
    expect(started - t).toBe(0);
  });

  it('keeps going after a task fails and propagates the result', async () => {
    const queue = new RateQueue(4);
    const failing = queue.schedule(async () => {
      throw new Error('boom');
    });
    const failed = expect(failing).rejects.toThrow('boom');
    const ok = queue.schedule(async () => 42);
    await vi.advanceTimersByTimeAsync(1000);
    await failed;
    await expect(ok).resolves.toBe(42);
  });
});
