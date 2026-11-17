import { eq, sql } from 'drizzle-orm';
import { users, type Db } from '@perch/db';

/**
 * Marks the user's recommendation inputs as changed (library, feedback, devices). Call it in the
 * same transaction as the write so the cache, which only serves rows computed from the current
 * version, never outlives it. Takes a transaction or the db.
 */
export async function bumpRecsVersion(db: Pick<Db, 'update'>, userId: string): Promise<void> {
  await db
    .update(users)
    .set({ recsVersion: sql`${users.recsVersion} + 1` })
    .where(eq(users.id, userId));
}

export async function getRecsVersion(db: Pick<Db, 'select'>, userId: string): Promise<number> {
  const [row] = await db.select({ v: users.recsVersion }).from(users).where(eq(users.id, userId));
  return row?.v ?? 0;
}
