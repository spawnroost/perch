import { and, eq, inArray } from 'drizzle-orm';
import { games, libraryEntries, type Db } from '@perch/db';
import { bumpRecsVersion } from '../recommendation-cache/version.js';
import type { Status } from './fields.js';
import type { PlayedBefore } from './played-before.js';

export type LibraryRow = typeof libraryEntries.$inferSelect & {
  name: string;
  coverUrl: string | null;
  coverUrlSmall: string | null;
  heroUrl: string | null;
  accent: string | null;
};

const columns = {
  entry: libraryEntries,
  name: games.name,
  coverUrl: games.coverUrl,
  coverUrlSmall: games.coverUrlSmall,
  heroUrl: games.heroUrl,
  accent: games.accent,
};
const flat = ({
  entry,
  ...game
}: {
  entry: typeof libraryEntries.$inferSelect;
} & Omit<LibraryRow, keyof typeof libraryEntries.$inferSelect>): LibraryRow => ({
  ...entry,
  ...game,
});

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
  if (patch.status !== undefined) {
    set.status = patch.status;
    set.playedBeforePending = false;
  }
  if (patch.owned !== undefined) set.owned = patch.owned;
  if (Object.keys(set).length > 0) {
    const updated = await db.transaction(async (tx) => {
      const rows = await tx
        .update(libraryEntries)
        .set(set)
        .where(and(eq(libraryEntries.userId, userId), eq(libraryEntries.id, id)))
        .returning({ id: libraryEntries.id });
      if (rows.length > 0) await bumpRecsVersion(tx, userId);
      return rows.length > 0;
    });
    if (!updated) return null;
  }
  return getLibraryEntry(db, userId, id);
}

/** Deletes the user's entry; false when it is not theirs. */
export async function deleteLibraryEntry(db: Db, userId: string, id: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .delete(libraryEntries)
      .where(and(eq(libraryEntries.userId, userId), eq(libraryEntries.id, id)))
      .returning({ id: libraryEntries.id });
    if (rows.length > 0) await bumpRecsVersion(tx, userId);
    return rows.length > 0;
  });
}

/** Entries an import flagged as played before and the user has not decided on yet, most played first. */
export async function listPlayedBefore(db: Db, userId: string): Promise<PlayedBefore[]> {
  const rows = await db
    .select({
      id: libraryEntries.id,
      title: games.name,
      hours: libraryEntries.hoursPlayed,
      lastPlayed: libraryEntries.lastPlayed,
    })
    .from(libraryEntries)
    .innerJoin(games, eq(games.igdbId, libraryEntries.igdbId))
    .where(and(eq(libraryEntries.userId, userId), eq(libraryEntries.playedBeforePending, true)));
  return rows
    .map((r) => ({
      entryId: r.id,
      title: r.title,
      minutes: r.hours === null ? null : Math.round(r.hours * 60),
      lastPlayed: r.lastPlayed?.toISOString() ?? null,
    }))
    .sort((a, b) => (b.minutes ?? -1) - (a.minutes ?? -1) || a.title.localeCompare(b.title));
}

/** "Keep in Backlog": stops asking about these entries without changing them. Returns how many. */
export async function dismissPlayedBefore(
  db: Db,
  userId: string,
  ids: readonly string[],
): Promise<{ updated: number }> {
  if (ids.length === 0) return { updated: 0 };
  const rows = await db
    .update(libraryEntries)
    .set({ playedBeforePending: false })
    .where(and(eq(libraryEntries.userId, userId), inArray(libraryEntries.id, [...new Set(ids)])))
    .returning({ id: libraryEntries.id });
  return { updated: rows.length };
}

/** Sets one status on several of the user's entries (ids that are not theirs are skipped). */
export async function setLibraryStatus(
  db: Db,
  userId: string,
  ids: readonly string[],
  status: Status,
): Promise<{ updated: number }> {
  if (ids.length === 0) return { updated: 0 };
  return db.transaction(async (tx) => {
    const rows = await tx
      .update(libraryEntries)
      .set({ status, playedBeforePending: false })
      .where(and(eq(libraryEntries.userId, userId), inArray(libraryEntries.id, [...new Set(ids)])))
      .returning({ id: libraryEntries.id });
    if (rows.length > 0) await bumpRecsVersion(tx, userId);
    return { updated: rows.length };
  });
}
