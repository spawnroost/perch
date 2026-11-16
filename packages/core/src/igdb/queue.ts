/** Serialises request starts at most `maxPerSecond` per second (IGDB allows 4). */
export class RateQueue {
  private readonly intervalMs: number;
  private nextStart = 0;
  private tail: Promise<void> = Promise.resolve();
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;

  /** `now` / `sleep` are injectable so tests can run on a fake clock. */
  constructor(
    maxPerSecond = 4,
    clock: { now?: () => number; sleep?: (ms: number) => Promise<void> } = {},
  ) {
    this.intervalMs = 1000 / maxPerSecond;
    this.now = clock.now ?? Date.now;
    this.sleep = clock.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  schedule<T>(task: () => Promise<T>): Promise<T> {
    const slot = this.tail.then(async () => {
      const wait = this.nextStart - this.now();
      if (wait > 0) await this.sleep(wait);
      this.nextStart = Math.max(this.now(), this.nextStart) + this.intervalMs;
    });
    this.tail = slot;
    return slot.then(task);
  }
}
