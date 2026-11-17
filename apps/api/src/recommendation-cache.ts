import { and, eq, lte } from 'drizzle-orm';
import {
  computedAtFor,
  getRecsVersion,
  isFresh,
  isSettled,
  type RecommendationsResponse,
} from '@perch/core';
import { schema, type Db } from '@perch/db';

const { recommendationCache } = schema;

/** Recomputes in flight per user + key + version; concurrent requests share one. */
const inflight = new Map<string, Promise<RecommendationsResponse>>();

/**
 * Read-through cache of one user's recommendations. A row is only ever served while its version
 * equals the user's `recs_version` (bumped by every write that feeds the engine, in core):
 * - same version, fresh: returned as is.
 * - same version, older than the max age: returned, and recomputed in the background.
 * - different version or no row: computed, stored, returned.
 */
export async function cachedRecommendations(
  db: Db,
  userId: string,
  key: string,
  compute: () => Promise<RecommendationsResponse>,
  now: Date = new Date(),
): Promise<RecommendationsResponse> {
  // Read before computing: a write during the compute leaves the stored row behind the user.
  const version = await getRecsVersion(db, userId);
  const [row] = await db
    .select()
    .from(recommendationCache)
    .where(and(eq(recommendationCache.userId, userId), eq(recommendationCache.key, key)));
  if (row?.version === version) {
    if (!isFresh(row.computedAt, now)) {
      recompute(db, userId, key, version, compute, true).catch((err) => console.error(err));
    }
    return row.payload as RecommendationsResponse;
  }
  return recompute(db, userId, key, version, compute, false);
}

function recompute(
  db: Db,
  userId: string,
  key: string,
  version: number,
  compute: () => Promise<RecommendationsResponse>,
  hadRow: boolean,
): Promise<RecommendationsResponse> {
  const flight = `${userId}\u0000${key}\u0000${version}`;
  const running = inflight.get(flight);
  if (running) return running;
  const p = (async () => {
    const payload = await compute();
    const settled = isSettled(payload.recommendations, { requireTimeToBeat: !hadRow });
    const computedAt = computedAtFor(new Date(), settled);
    await db
      .insert(recommendationCache)
      .values({ userId, key, payload, version, computedAt })
      .onConflictDoUpdate({
        target: [recommendationCache.userId, recommendationCache.key],
        set: { payload, version, computedAt },
        // A slow compute must not replace a row computed from newer data.
        setWhere: lte(recommendationCache.version, version),
      });
    return payload;
  })().finally(() => {
    if (inflight.get(flight) === p) inflight.delete(flight);
  });
  inflight.set(flight, p);
  return p;
}
