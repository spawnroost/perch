/** Remembers async answers by key for `ttlMs`, keeping at most `max` (least recently used go first). */
export interface TtlMemo<V> {
  /** The remembered answer, else `make()`'s (concurrent callers share one call; failures are not kept). */
  get(key: string, make: () => Promise<V>): Promise<V>;
}

export function createTtlMemo<V>(
  opts: { ttlMs?: number; max?: number; now?: () => number } = {},
): TtlMemo<V> {
  const { ttlMs = 10 * 60_000, max = 100, now = Date.now } = opts;
  const entries = new Map<string, { at: number; value: Promise<V> }>();
  return {
    get(key, make) {
      const hit = entries.get(key);
      entries.delete(key); // expired, or about to be re-inserted as the most recent
      if (hit && now() - hit.at < ttlMs) {
        entries.set(key, hit);
        return hit.value;
      }
      const value = make();
      entries.set(key, { at: now(), value });
      value.catch(() => {
        if (entries.get(key)?.value === value) entries.delete(key);
      });
      while (entries.size > max) entries.delete(entries.keys().next().value!);
      return value;
    },
  };
}
