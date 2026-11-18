import { and, eq, sql } from 'drizzle-orm';
import { users, type Db } from '@perch/db';
import { shouldAutoSync } from './status.js';

export interface AutoSyncClaim {
  claimed: boolean;
  /** The `steam_synced_at` the claim replaced. */
  previous: Date | null;
  /** The value the claim wrote. */
  claimedAt: Date;
}

/**
 * Takes the right to auto-sync by stamping `steam_synced_at` only if the last sync is missing or
 * 6 hours old and still unchanged since we read it, so concurrent callers (or server instances)
 * have exactly one winner.
 */
export async function claimSteamAutoSync(
  db: Pick<Db, 'select' | 'update'>,
  userId: string,
  now: Date,
): Promise<AutoSyncClaim> {
  const [row] = await db
    .select({ at: users.steamSyncedAt })
    .from(users)
    .where(eq(users.id, userId));
  const previous = row?.at ?? null;
  const lost = { claimed: false, previous, claimedAt: now };
  if (!row || !shouldAutoSync(previous, now)) return lost;
  const won = await db
    .update(users)
    .set({ steamSyncedAt: now })
    .where(
      and(
        eq(users.id, userId),
        previous ? eq(users.steamSyncedAt, previous) : sql`${users.steamSyncedAt} is null`,
      ),
    )
    .returning({ id: users.id });
  return { ...lost, claimed: won.length > 0 };
}

/** Undoes a claim after a failed import so the next trigger retries. A newer stamp is left alone. */
export async function releaseSteamAutoSync(
  db: Pick<Db, 'update'>,
  userId: string,
  claim: AutoSyncClaim,
): Promise<void> {
  if (!claim.claimed) return;
  await db
    .update(users)
    .set({ steamSyncedAt: claim.previous })
    .where(and(eq(users.id, userId), eq(users.steamSyncedAt, claim.claimedAt)));
}
