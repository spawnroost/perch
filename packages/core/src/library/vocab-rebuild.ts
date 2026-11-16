import { eq } from 'drizzle-orm';
import { games, type Db } from '@perch/db';

/**
 * Recomputes the stored `games.vocab` of every row with `mapVocab` (so a vocab table change
 * reaches already-cached games). Rows whose vocab is unchanged are skipped.
 * Returns the number of rows updated.
 */
export async function rebuildVocab(
  db: Db,
  mapVocab: (game: typeof games.$inferSelect) => Record<string, number>,
): Promise<number> {
  const rows = await db.select().from(games);
  let updated = 0;
  for (const row of rows) {
    const vocab = mapVocab(row);
    if (JSON.stringify(sortKeys(vocab)) === JSON.stringify(sortKeys(row.vocab))) continue;
    await db.update(games).set({ vocab }).where(eq(games.igdbId, row.igdbId));
    updated++;
  }
  return updated;
}

const sortKeys = (o: Record<string, number>): [string, number][] =>
  Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1));
