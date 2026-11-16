/** Serialises request starts at most `maxPerSecond` per second (IGDB allows 4). */
export class RateQueue {
  private readonly intervalMs: number;
  private nextStart = 0;
  private tail: Promise<void> = Promise.resolve();

  constructor(maxPerSecond = 4) {
    this.intervalMs = 1000 / maxPerSecond;
  }

  schedule<T>(task: () => Promise<T>): Promise<T> {
    const slot = this.tail.then(async () => {
      const wait = this.nextStart - Date.now();
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      this.nextStart = Math.max(Date.now(), this.nextStart) + this.intervalMs;
    });
    this.tail = slot;
    return slot.then(task);
  }
}
