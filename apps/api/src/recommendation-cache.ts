import type { MiddlewareHandler } from 'hono';
import { and, eq } from 'drizzle-orm';
import { computedAtFor, isFresh, isSettled, type RecommendationsResponse } from '@perch/core';
import { schema, type Db } from '@perch/db';
import type { AppVars } from './app.js';

const { recommendationCache } = schema;

/** Recomputes in flight, one per user + key; concurrent requests share it. */
const inflight = new Map<string, Promise<RecommendationsResponse>>();
/** Bumped on every invalidation: a compute that started before one must not be stored. */
const generations = new Map<string, number>();

const flightKey = (userId: string, key: string) => `${userId}\u0000${key}`;

/** Drops every cached recommendation for the user. Call after any write that feeds the engine. */
export async function invalidateRecommendations(db: Db, userId: string): Promise<void> {
  generations.set(userId, (generations.get(userId) ?? 0) + 1);
  for (const k of inflight.keys()) if (k.startsWith(`${userId}\u0000`)) inflight.delete(k);
  await db.delete(recommendationCache).where(eq(recommendationCache.userId, userId));
}

/** Middleware: any non-GET request under the mounted path invalidates the caller's cache after it. */
export function invalidatesRecommendations(db: Db): MiddlewareHandler<AppVars> {
  return async (c, next) => {
    try {
      await next();
    } finally {
      const user = c.get('sessionUser');
      if (user && c.req.method !== 'GET') await invalidateRecommendations(db, user.id);
    }
  };
}

/**
 * Read-through cache. Fresh row: returned as is. Stale row: returned, and recomputed in the
 * background. No row: computed, stored, returned.
 */
export async function cachedRecommendations(
  db: Db,
  userId: string,
  key: string,
  compute: () => Promise<RecommendationsResponse>,
  now: Date = new Date(),
): Promise<RecommendationsResponse> {
  const [row] = await db
    .select()
    .from(recommendationCache)
    .where(and(eq(recommendationCache.userId, userId), eq(recommendationCache.key, key)));
  if (row && isFresh(row.computedAt, now)) return row.payload as RecommendationsResponse;
  if (row) {
    refresh(db, userId, key, compute, true).catch((err) => console.error(err));
    return row.payload as RecommendationsResponse;
  }
  return refresh(db, userId, key, compute, false);
}

function refresh(
  db: Db,
  userId: string,
  key: string,
  compute: () => Promise<RecommendationsResponse>,
  hadRow: boolean,
): Promise<RecommendationsResponse> {
  const fk = flightKey(userId, key);
  const running = inflight.get(fk);
  if (running) return running;
  const generation = generations.get(userId) ?? 0;
  const p = (async () => {
    const payload = await compute();
    if ((generations.get(userId) ?? 0) !== generation) return payload;
    const settled = isSettled(payload.recommendations, { requireTimeToBeat: !hadRow });
    const computedAt = computedAtFor(new Date(), settled);
    await db
      .insert(recommendationCache)
      .values({ userId, key, payload, computedAt })
      .onConflictDoUpdate({
        target: [recommendationCache.userId, recommendationCache.key],
        set: { payload, computedAt },
      });
    return payload;
  })().finally(() => {
    if (inflight.get(fk) === p) inflight.delete(fk);
  });
  inflight.set(fk, p);
  return p;
}
