import { and, count, desc, eq } from 'drizzle-orm';
import { games, priceWatches, type Db } from '@perch/db';
import { WATCH_LIMIT } from './schemas.js';

/** The user already watches the most games allowed. */
export class WatchLimitError extends Error {
  constructor() {
    super(`You can watch at most ${WATCH_LIMIT} games`);
    this.name = 'WatchLimitError';
  }
}

export interface WatchRow {
  igdbId: number;
  name: string;
  slug: string;
  coverUrlSmall: string | null;
  accent: string | null;
  steamAppId: number | null;
  targetPrice: number | null;
  lastNotifiedPrice: number | null;
  createdAt: Date;
}

/**
 * Starts watching a game, or changes the target of an existing watch (which forgets the deal
 * already announced, so a new target is checked afresh). The game must be in the games cache.
 */
export async function setWatch(
  db: Db,
  userId: string,
  igdbId: number,
  targetPrice: number | null,
): Promise<void> {
  const [existing] = await db
    .select({ igdbId: priceWatches.igdbId })
    .from(priceWatches)
    .where(and(eq(priceWatches.userId, userId), eq(priceWatches.igdbId, igdbId)));
  if (!existing) {
    const [{ n } = { n: 0 }] = await db
      .select({ n: count() })
      .from(priceWatches)
      .where(eq(priceWatches.userId, userId));
    if (n >= WATCH_LIMIT) throw new WatchLimitError();
  }
  await db
    .insert(priceWatches)
    .values({ userId, igdbId, targetPrice })
    .onConflictDoUpdate({
      target: [priceWatches.userId, priceWatches.igdbId],
      set: { targetPrice, lastNotifiedPrice: null, lastNotifiedAt: null },
    });
}

export async function removeWatch(db: Db, userId: string, igdbId: number): Promise<void> {
  await db
    .delete(priceWatches)
    .where(and(eq(priceWatches.userId, userId), eq(priceWatches.igdbId, igdbId)));
}

/** The user's watches with their game, newest first. */
export async function listWatches(db: Db, userId: string): Promise<WatchRow[]> {
  return db
    .select({
      igdbId: priceWatches.igdbId,
      name: games.name,
      slug: games.slug,
      coverUrlSmall: games.coverUrlSmall,
      accent: games.accent,
      steamAppId: games.steamAppId,
      targetPrice: priceWatches.targetPrice,
      lastNotifiedPrice: priceWatches.lastNotifiedPrice,
      createdAt: priceWatches.createdAt,
    })
    .from(priceWatches)
    .innerJoin(games, eq(games.igdbId, priceWatches.igdbId))
    .where(eq(priceWatches.userId, userId))
    .orderBy(desc(priceWatches.createdAt));
}
