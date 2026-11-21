import { and, eq, sql } from 'drizzle-orm';
import { users, type Db } from '@perch/db';
import { shouldAutoSync } from './status.js';

/** The "last ran" columns on users that background jobs claim (store syncs, the price digest). */
export type SyncedAtColumn = 'steamSyncedAt' | 'xboxSyncedAt' | 'psnSyncedAt' | 'priceDigestAt';

export interface AutoSyncClaim {
  claimed: boolean;
  /** The synced-at value the claim replaced. */
  previous: Date | null;
  /** The value the claim wrote. */
  claimedAt: Date;
}

/**
 * Takes the right to auto-sync by stamping the store's synced-at column only if the last sync is missing or
 * 6 hours old (`intervalMs` overrides that) and still unchanged since we read it, so concurrent callers (or server instances)
 * have exactly one winner.
 */
export async function claimAutoSync(
  db: Pick<Db, 'select' | 'update'>,
  userId: string,
  now: Date,
  column: SyncedAtColumn = 'steamSyncedAt',
  intervalMs?: number,
): Promise<AutoSyncClaim> {
  const col = users[column];
  const [row] = await db.select({ at: col }).from(users).where(eq(users.id, userId));
  const previous = row?.at ?? null;
  const lost = { claimed: false, previous, claimedAt: now };
  if (!row || !shouldAutoSync(previous, now, intervalMs)) return lost;
  const won = await db
    .update(users)
    .set({ [column]: now })
    .where(and(eq(users.id, userId), previous ? eq(col, previous) : sql`${col} is null`))
    .returning({ id: users.id });
  return { ...lost, claimed: won.length > 0 };
}

/** Undoes a claim after a failed import so the next trigger retries. A newer stamp is left alone. */
export async function releaseAutoSync(
  db: Pick<Db, 'update'>,
  userId: string,
  claim: AutoSyncClaim,
  column: SyncedAtColumn = 'steamSyncedAt',
): Promise<void> {
  if (!claim.claimed) return;
  await db
    .update(users)
    .set({ [column]: claim.previous })
    .where(and(eq(users.id, userId), eq(users[column], claim.claimedAt)));
}

export const claimSteamAutoSync = (db: Pick<Db, 'select' | 'update'>, userId: string, now: Date) =>
  claimAutoSync(db, userId, now, 'steamSyncedAt');
export const releaseSteamAutoSync = (
  db: Pick<Db, 'update'>,
  userId: string,
  claim: AutoSyncClaim,
) => releaseAutoSync(db, userId, claim, 'steamSyncedAt');
