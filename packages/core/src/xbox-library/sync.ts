import { eq } from 'drizzle-orm';
import { users, type Db } from '@perch/db';
import type { IgdbCache } from '../igdb/cache.js';
import type { IgdbClient } from '../igdb/client.js';
import { EXPORT_UNMATCHED_SHOWN } from '../library-export/schemas.js';
import { resolveExactNames } from '../library-export/resolve.js';
import { upsertImportedEntries } from '../library/bulk.js';
import { normaliseName } from '../library/match.js';
import { buildLibraryRow } from '../library/rows.js';
import { bumpRecsVersion } from '../recommendation-cache/version.js';
import { steamImportStatus } from '../steam-library/status.js';
import { XboxAccountChangedError } from './errors.js';
import type { XboxSyncResult, XboxTitle } from './schemas.js';

export interface XboxSyncDeps {
  db: Db;
  cache: Pick<IgdbCache, 'getGames'>;
  client: Pick<IgdbClient, 'gamesByExactName'>;
  /** Wraps fetchTitleHistory with the API key (and a stub in tests). */
  fetchTitles: (xuid: string) => Promise<XboxTitle[]>;
  now?: () => Date;
}

/**
 * Imports the user's Xbox title history as Xbox (or PC) entries, matched to IGDB by exact cleaned
 * name (IGDB's Microsoft ids are store product ids, not the title ids Xbox sends). Hours are not
 * known. Existing entries only gain data (last-played never goes down, status is left alone);
 * a new one is playing when played in the last 30 days, backlog otherwise. Writes nothing if the
 * user's linked xuid is no longer `xuid` by the time it writes.
 */
export async function syncXboxLibrary(
  deps: XboxSyncDeps,
  userId: string,
  xuid: string,
): Promise<XboxSyncResult> {
  const { db, cache } = deps;
  const now = (deps.now ?? (() => new Date()))();
  const titles = await deps.fetchTitles(xuid);
  const byName = await resolveExactNames(
    deps.client,
    titles.map((t) => t.name),
  );
  const ids = titles.map((t) => byName.get(normaliseName(t.name)) ?? null);
  const known = new Set(
    (await cache.getGames([...new Set(ids.filter((i): i is number => i !== null))])).map(
      (g) => g.igdbId,
    ),
  );

  // Editions of one game on one platform collapse into one entry.
  const merged = new Map<string, { igdbId: number; platform: string; lastPlayed: Date | null }>();
  const unmatched: string[] = [];
  titles.forEach((t, i) => {
    const igdbId = ids[i];
    if (igdbId === null || igdbId === undefined || !known.has(igdbId)) {
      unmatched.push(t.name);
      return;
    }
    const key = `${igdbId}:${t.platform}`;
    const cur = merged.get(key) ?? { igdbId, platform: t.platform, lastPlayed: null };
    if (t.lastPlayed && (!cur.lastPlayed || t.lastPlayed > cur.lastPlayed))
      cur.lastPlayed = t.lastPlayed;
    merged.set(key, cur);
  });

  const rows = [...merged.values()].map(
    ({ igdbId, platform, lastPlayed }) =>
      buildLibraryRow({
        userId,
        igdbId,
        platform,
        source: 'xbox',
        owned: true,
        lastPlayed: lastPlayed ?? undefined,
        status: steamImportStatus({ lastPlayed, now }),
      }).insert,
  );

  let counts = { imported: 0, updated: 0 };
  await db.transaction(async (tx) => {
    const [owner] = await tx
      .select({ xuid: users.xboxXuid })
      .from(users)
      .where(eq(users.id, userId))
      .for('update');
    if (owner?.xuid !== xuid) throw new XboxAccountChangedError();

    counts = await upsertImportedEntries(tx, rows);
    await tx.update(users).set({ xboxSyncedAt: now }).where(eq(users.id, userId));
    await bumpRecsVersion(tx, userId);
  });

  return {
    ...counts,
    unmatched: unmatched.slice(0, EXPORT_UNMATCHED_SHOWN),
    unmatchedCount: unmatched.length,
    total: titles.length,
  };
}
