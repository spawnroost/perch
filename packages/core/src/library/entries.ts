import { and, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm';
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
  /** 1-5; null clears. */
  rating?: number | null;
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
  if (patch.rating !== undefined) set.rating = patch.rating;
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

/**
 * Still worth asking: flagged by an import, still backlog, and not played in the last 30 days
 * (a later sync or edit may have changed that since the flag was set).
 */
const pendingPlayedBefore = (userId: string) =>
  and(
    eq(libraryEntries.userId, userId),
    eq(libraryEntries.playedBeforePending, true),
    eq(libraryEntries.status, 'backlog'),
    or(
      isNull(libraryEntries.lastPlayed),
      lt(libraryEntries.lastPlayed, sql`now() - interval '30 days'`),
    ),
  );

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
    .where(pendingPlayedBefore(userId));
  return rows
    .map((r) => ({
      entryId: r.id,
      title: r.title,
      minutes: r.hours === null ? null : Math.round(r.hours * 60),
      lastPlayed: r.lastPlayed?.toISOString() ?? null,
    }))
    .sort((a, b) => (b.minutes ?? -1) - (a.minutes ?? -1) || a.title.localeCompare(b.title));
}

/**
 * The answer to the played-before prompt in one transaction: `pausedIds` become Paused, `keptIds`
 * stay as they are and are not asked about again. Ids that are not the user's are skipped.
 */
export async function resolvePlayedBefore(
  db: Db,
  userId: string,
  { pausedIds, keptIds }: { pausedIds: readonly string[]; keptIds: readonly string[] },
): Promise<{ paused: number; kept: number }> {
  return db.transaction(async (tx) => {
    const paused = await setStatusIn(tx, userId, pausedIds, 'paused');
    let kept = 0;
    if (keptIds.length > 0) {
      const rows = await tx
        .update(libraryEntries)
        .set({ playedBeforePending: false })
        .where(
          and(eq(libraryEntries.userId, userId), inArray(libraryEntries.id, [...new Set(keptIds)])),
        )
        .returning({ id: libraryEntries.id });
      kept = rows.length;
    }
    return { paused, kept };
  });
}

/** Sets the status (and settles the played-before question) and bumps the recs version once. */
async function setStatusIn(
  tx: Pick<Db, 'update'>,
  userId: string,
  ids: readonly string[],
  status: Status,
): Promise<number> {
  if (ids.length === 0) return 0;
  const rows = await tx
    .update(libraryEntries)
    .set({ status, playedBeforePending: false })
    .where(and(eq(libraryEntries.userId, userId), inArray(libraryEntries.id, [...new Set(ids)])))
    .returning({ id: libraryEntries.id });
  if (rows.length > 0) await bumpRecsVersion(tx, userId);
  return rows.length;
}

/** Sets one status on several of the user's entries (ids that are not theirs are skipped). */
export async function setLibraryStatus(
  db: Db,
  userId: string,
  ids: readonly string[],
  status: Status,
): Promise<{ updated: number }> {
  return { updated: await db.transaction((tx) => setStatusIn(tx, userId, ids, status)) };
}
