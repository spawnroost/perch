import { and, count, desc, eq, sql } from 'drizzle-orm';
import { games, priceWatches, users, type Db } from '@perch/db';
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
 * Starts watching a game, or changes the target of an existing watch. Only a changed target
 * forgets the deal already announced (so it is checked afresh); saving the same one keeps it.
 * The count and the insert run under a lock on the user's row, so concurrent adds cannot pass
 * the cap together. The game must be in the games cache.
 */
export async function setWatch(
  db: Db,
  userId: string,
  igdbId: number,
  targetPrice: number | null,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for('update');
    const [existing] = await tx
      .select({ igdbId: priceWatches.igdbId })
      .from(priceWatches)
      .where(and(eq(priceWatches.userId, userId), eq(priceWatches.igdbId, igdbId)));
    if (!existing) {
      const [{ n } = { n: 0 }] = await tx
        .select({ n: count() })
        .from(priceWatches)
        .where(eq(priceWatches.userId, userId));
      if (n >= WATCH_LIMIT) throw new WatchLimitError();
    }
    const changed = sql`${priceWatches.targetPrice} is distinct from ${targetPrice}::numeric`;
    await tx
      .insert(priceWatches)
      .values({ userId, igdbId, targetPrice })
      .onConflictDoUpdate({
        target: [priceWatches.userId, priceWatches.igdbId],
        set: {
          targetPrice,
          lastNotifiedPrice: sql`case when ${changed} then null else ${priceWatches.lastNotifiedPrice} end`,
          lastNotifiedAt: sql`case when ${changed} then null else ${priceWatches.lastNotifiedAt} end`,
        },
      });
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

/** Turns the daily price-watch email on or off for the user; watches keep working either way. */
export async function setPriceEmails(db: Db, userId: string, enabled: boolean): Promise<void> {
  await db.update(users).set({ priceEmails: enabled }).where(eq(users.id, userId));
}

export async function priceEmailsEnabled(db: Db, userId: string): Promise<boolean> {
  const [row] = await db.select({ on: users.priceEmails }).from(users).where(eq(users.id, userId));
  return row?.on ?? true;
}
