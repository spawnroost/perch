import { and, eq } from 'drizzle-orm';
import { games, libraryEntries, type Db } from '@perch/db';
import type { Status } from './fields.js';

export type LibraryRow = typeof libraryEntries.$inferSelect & {
  name: string;
  coverUrl: string | null;
};

const columns = { entry: libraryEntries, name: games.name, coverUrl: games.coverUrl };
const flat = (r: {
  entry: typeof libraryEntries.$inferSelect;
  name: string;
  coverUrl: string | null;
}): LibraryRow => ({ ...r.entry, name: r.name, coverUrl: r.coverUrl });

/** The user's library, newest first. */
export async function listLibrary(db: Db, userId: string): Promise<LibraryRow[]> {
  const rows = await db
    .select(columns)
    .from(libraryEntries)
    .innerJoin(games, eq(games.igdbId, libraryEntries.igdbId))
    .where(eq(libraryEntries.userId, userId));
  return rows.map(flat).sort((a, b) => b.addedAt.getTime() - a.addedAt.getTime());
}

/** One entry by id; null when it is not the user's. */
export async function getLibraryEntry(
  db: Db,
  userId: string,
  id: string,
): Promise<LibraryRow | null> {
  const [row] = await db
    .select(columns)
    .from(libraryEntries)
    .innerJoin(games, eq(games.igdbId, libraryEntries.igdbId))
    .where(and(eq(libraryEntries.userId, userId), eq(libraryEntries.id, id)));
  return row ? flat(row) : null;
}

/** The entry for a game on a platform; null when the user has none. */
export async function findLibraryEntry(
  db: Db,
  userId: string,
  igdbId: number,
  platform: string,
): Promise<LibraryRow | null> {
  const [row] = await db
    .select(columns)
    .from(libraryEntries)
    .innerJoin(games, eq(games.igdbId, libraryEntries.igdbId))
    .where(
      and(
        eq(libraryEntries.userId, userId),
        eq(libraryEntries.igdbId, igdbId),
        eq(libraryEntries.platform, platform),
      ),
    );
  return row ? flat(row) : null;
}

export interface LibraryPatch {
  hoursPlayed?: number | null;
  lastPlayed?: Date | null;
  status?: Status;
  owned?: boolean;
}

/** Updates the given fields of the user's entry; null when it is not theirs. */
export async function updateLibraryEntry(
  db: Db,
  userId: string,
  id: string,
  patch: LibraryPatch,
): Promise<LibraryRow | null> {
  const set: Partial<typeof libraryEntries.$inferInsert> = {};
  if (patch.hoursPlayed !== undefined) set.hoursPlayed = patch.hoursPlayed;
  if (patch.lastPlayed !== undefined) set.lastPlayed = patch.lastPlayed;
  if (patch.status !== undefined) set.status = patch.status;
  if (patch.owned !== undefined) set.owned = patch.owned;
  if (Object.keys(set).length > 0) {
    const rows = await db
      .update(libraryEntries)
      .set(set)
      .where(and(eq(libraryEntries.userId, userId), eq(libraryEntries.id, id)))
      .returning({ id: libraryEntries.id });
    if (rows.length === 0) return null;
  }
  return getLibraryEntry(db, userId, id);
}

/** Deletes the user's entry; false when it is not theirs. */
export async function deleteLibraryEntry(db: Db, userId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(libraryEntries)
    .where(and(eq(libraryEntries.userId, userId), eq(libraryEntries.id, id)))
    .returning({ id: libraryEntries.id });
  return rows.length > 0;
}
