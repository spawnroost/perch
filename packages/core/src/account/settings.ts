import { eq, sql } from 'drizzle-orm';
import { users, type Db } from '@perch/db';
import type { AccountPatch } from '../schemas/account.js';

export interface AccountSettings {
  hideFreeToPlay: boolean;
}

/** The user's engine-affecting settings (defaults when the user row is gone). */
export async function getAccountSettings(
  db: Pick<Db, 'select'>,
  userId: string,
): Promise<AccountSettings> {
  const [row] = await db
    .select({ hideFreeToPlay: users.hideFreeToPlay })
    .from(users)
    .where(eq(users.id, userId));
  return { hideFreeToPlay: row?.hideFreeToPlay ?? true };
}

/** Applies a settings patch and bumps `recs_version` in the same statement. */
export async function updateAccountSettings(
  db: Pick<Db, 'update'>,
  userId: string,
  patch: AccountPatch,
): Promise<AccountSettings> {
  const [row] = await db
    .update(users)
    .set({
      ...(patch.hideFreeToPlay === undefined ? {} : { hideFreeToPlay: patch.hideFreeToPlay }),
      recsVersion: sql`${users.recsVersion} + 1`,
    })
    .where(eq(users.id, userId))
    .returning({ hideFreeToPlay: users.hideFreeToPlay });
  return { hideFreeToPlay: row?.hideFreeToPlay ?? true };
}
