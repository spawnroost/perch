import { and, eq, lt, sql } from 'drizzle-orm';
import { llmUsage, type Db } from '@perch/db';

/** Most LLM batches one user can start per day. */
export const USER_DAILY_BATCH_CAP = 30;
export const DEFAULT_GLOBAL_DAILY_BATCH_CAP = 500;

const dayOf = (now: Date) => now.toISOString().slice(0, 10);

class CapReached extends Error {}

/** Adds one to the counter unless it is already at `cap`; false when it is. */
async function bump(
  tx: Pick<Db, 'insert'>,
  key: string,
  day: string,
  cap: number,
): Promise<boolean> {
  if (cap <= 0) return false;
  const rows = await tx
    .insert(llmUsage)
    .values({ key, day, count: 1 })
    .onConflictDoUpdate({
      target: [llmUsage.key, llmUsage.day],
      set: { count: sql`${llmUsage.count} + 1` },
      setWhere: sql`${llmUsage.count} < ${cap}`,
    })
    .returning({ count: llmUsage.count });
  return rows.length > 0;
}

/**
 * Spends one LLM batch from the user's and the global daily allowance (UTC day). False, with
 * nothing spent, when either is used up. `scope` prefixes the counter keys, so a feature can keep
 * its own allowance apart from the For-you reasons.
 */
export async function reserveLlmBatch(
  db: Db,
  userId: string,
  opts: { globalCap: number; userCap?: number; now?: Date; scope?: string },
): Promise<boolean> {
  const day = dayOf(opts.now ?? new Date());
  // Counters of another feature live under their own key prefix, e.g. `voice:global`.
  const prefix = opts.scope ? `${opts.scope}:` : '';
  try {
    await db.transaction(async (tx) => {
      // Counters of earlier days are of no use any more.
      await tx.delete(llmUsage).where(lt(llmUsage.day, day));
      if (!(await bump(tx, `${prefix}global`, day, opts.globalCap))) throw new CapReached();
      if (!(await bump(tx, `${prefix}user:${userId}`, day, opts.userCap ?? USER_DAILY_BATCH_CAP)))
        throw new CapReached();
    });
    return true;
  } catch (err) {
    if (err instanceof CapReached) return false;
    throw err;
  }
}

/** Batches the user has started today (tests, diagnostics). */
export async function llmBatchesToday(db: Db, userId: string, now = new Date()): Promise<number> {
  const [row] = await db
    .select({ count: llmUsage.count })
    .from(llmUsage)
    .where(and(eq(llmUsage.key, `user:${userId}`), eq(llmUsage.day, dayOf(now))));
  return row?.count ?? 0;
}
