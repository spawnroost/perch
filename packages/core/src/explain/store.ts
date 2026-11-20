import { and, eq, inArray, sql } from 'drizzle-orm';
import { gameReasons, type Db } from '@perch/db';

/** The user's stored reasons for these games that were written at `version`. */
export async function loadReasons(
  db: Db,
  userId: string,
  version: number,
  igdbIds: readonly number[],
): Promise<Map<number, string>> {
  if (igdbIds.length === 0) return new Map();
  const rows = await db
    .select({ igdbId: gameReasons.igdbId, text: gameReasons.text })
    .from(gameReasons)
    .where(
      and(
        eq(gameReasons.userId, userId),
        eq(gameReasons.recsVersion, version),
        inArray(gameReasons.igdbId, [...igdbIds]),
      ),
    );
  return new Map(rows.map((r) => [r.igdbId, r.text]));
}

/** Stores reasons for the user at `version`, replacing any older ones. */
export async function saveReasons(
  db: Db,
  userId: string,
  version: number,
  reasons: ReadonlyMap<number, string>,
): Promise<void> {
  if (reasons.size === 0) return;
  const values = [...reasons].map(([igdbId, text]) => ({
    userId,
    igdbId,
    recsVersion: version,
    text,
  }));
  await db
    .insert(gameReasons)
    .values(values)
    .onConflictDoUpdate({
      target: [gameReasons.userId, gameReasons.igdbId],
      set: {
        recsVersion: version,
        text: sql`excluded.text`,
        createdAt: new Date(),
      },
      // A slow batch for an older version must not replace a newer reason.
      setWhere: sql`excluded.recs_version >= ${gameReasons.recsVersion}`,
    });
}
