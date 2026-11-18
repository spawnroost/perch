import type { TagQuery } from '../igdb/client.js';

/**
 * Remembers tag-query answers for `ttlMs` (default 10 minutes), so "Load more" and chip toggles
 * back and forth do not re-ask IGDB. Same tags in any order share an answer; failures are not kept.
 */
export function memoizeTagQuery<R>(
  fn: (q: TagQuery) => Promise<R>,
  opts: { ttlMs?: number; now?: () => number; maxEntries?: number } = {},
): (q: TagQuery) => Promise<R> {
  const { ttlMs = 10 * 60_000, now = Date.now, maxEntries = 100 } = opts;
  const entries = new Map<string, { at: number; value: Promise<R> }>();
  const sorted = (ids: readonly number[]) => [...ids].sort((a, b) => a - b).join(',');
  return (q) => {
    const key = `${sorted(q.genres)}|${sorted(q.themes)}|${q.match ?? 'any'}|${q.minRatingCount}|${q.limit}`;
    const hit = entries.get(key);
    if (hit && now() - hit.at < ttlMs) return hit.value;
    const value = fn(q);
    entries.set(key, { at: now(), value });
    value.catch(() => {
      if (entries.get(key)?.value === value) entries.delete(key);
    });
    if (entries.size > maxEntries) entries.delete(entries.keys().next().value!);
    return value;
  };
}
