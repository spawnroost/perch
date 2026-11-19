import { sql } from 'drizzle-orm';
import { libraryEntries, type Db } from '@perch/db';

const INSERT_CHUNK = 500;

export const minutesToHours = (minutes: number) => Math.round((minutes / 60) * 10) / 10;

/**
 * Bulk import upsert shared by the Steam sync and the export-file import. A new row is inserted
 * as given; an existing entry only gains data: hours and last-played never go down, status and
 * source are left alone, owned becomes true. Returns how many rows were new and how many existed.
 */
export async function upsertImportedEntries(
  tx: Pick<Db, 'insert'>,
  rows: (typeof libraryEntries.$inferInsert)[],
): Promise<{ imported: number; updated: number }> {
  let imported = 0;
  let updated = 0;
  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    const res = await tx
      .insert(libraryEntries)
      .values(rows.slice(i, i + INSERT_CHUNK))
      .onConflictDoUpdate({
        target: [libraryEntries.userId, libraryEntries.igdbId, libraryEntries.platform],
        set: {
          hoursPlayed: sql`greatest(${libraryEntries.hoursPlayed}, excluded.hours_played)`,
          lastPlayed: sql`greatest(${libraryEntries.lastPlayed}, excluded.last_played)`,
          owned: true,
        },
      })
      // xmax is 0 only on a freshly inserted row; an ON CONFLICT update sets it.
      .returning({ inserted: sql<boolean>`(xmax = 0)` });
    for (const r of res) {
      if (r.inserted) imported++;
      else updated++;
    }
  }
  return { imported, updated };
}
