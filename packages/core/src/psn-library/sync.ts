import { eq } from 'drizzle-orm';
import { users, type Db } from '@perch/db';
import type { IgdbCache } from '../igdb/cache.js';
import type { IgdbClient } from '../igdb/client.js';
import { EXPORT_UNMATCHED_SHOWN } from '../library-export/schemas.js';
import { resolveExactNames } from '../library-export/resolve.js';
import { minutesToHours, upsertImportedEntries } from '../library/bulk.js';
import { normaliseName } from '../library/match.js';
import { isPlayedBefore } from '../library/played-before.js';
import { buildLibraryRow } from '../library/rows.js';
import { bumpRecsVersion } from '../recommendation-cache/version.js';
import { steamImportStatus } from '../steam-library/status.js';
import { PsnAccountChangedError } from './errors.js';
import type { PsnSyncResult, PsnTitle } from './schemas.js';

export interface PsnSyncDeps {
  db: Db;
  cache: Pick<IgdbCache, 'getGames'>;
  client: Pick<IgdbClient, 'gamesByExactName'>;
  /** Wraps the PSN client's fetchPlayedGames (and a stub in tests). */
  fetchTitles: (accountId: string) => Promise<PsnTitle[]>;
  now?: () => Date;
}

/**
 * Imports the user's PlayStation played-games list as PS4/PS5 entries, matched to IGDB by exact
 * cleaned name. Existing entries only gain data (hours and last-played never go down, status is
 * left alone); a new one is playing when played in the last 30 days, backlog otherwise, and is
 * flagged for the played-before prompt like a Steam import. Writes nothing if the user's linked
 * account is no longer `accountId` by the time it writes.
 */
export async function syncPsnLibrary(
  deps: PsnSyncDeps,
  userId: string,
  accountId: string,
): Promise<PsnSyncResult> {
  const { db, cache } = deps;
  const now = (deps.now ?? (() => new Date()))();
  const titles = await deps.fetchTitles(accountId);
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

  // Editions of one game on one platform collapse into one entry, playtime added together.
  const merged = new Map<
    string,
    { igdbId: number; platform: string; minutes: number; lastPlayed: Date | null }
  >();
  const unmatched: string[] = [];
  titles.forEach((t, i) => {
    const igdbId = ids[i];
    if (igdbId === null || igdbId === undefined || !known.has(igdbId)) {
      unmatched.push(t.name);
      return;
    }
    const key = `${igdbId}:${t.platform}`;
    const cur = merged.get(key) ?? { igdbId, platform: t.platform, minutes: 0, lastPlayed: null };
    cur.minutes += t.minutes;
    if (t.lastPlayed && (!cur.lastPlayed || t.lastPlayed > cur.lastPlayed))
      cur.lastPlayed = t.lastPlayed;
    merged.set(key, cur);
  });

  const rows = [...merged.values()].map(({ igdbId, platform, minutes, lastPlayed }) => {
    const status = steamImportStatus({ minutes, lastPlayed, now });
    const row = buildLibraryRow({
      userId,
      igdbId,
      platform,
      source: 'psn',
      owned: true,
      hours: minutes > 0 ? minutesToHours(minutes) : undefined,
      lastPlayed: lastPlayed ?? undefined,
      status,
    }).insert;
    row.playedBeforePending = isPlayedBefore({ status, minutes, lastPlayed });
    return row;
  });

  let counts = { imported: 0, updated: 0 };
  await db.transaction(async (tx) => {
    const [owner] = await tx
      .select({ accountId: users.psnAccountId })
      .from(users)
      .where(eq(users.id, userId))
      .for('update');
    if (owner?.accountId !== accountId) throw new PsnAccountChangedError();

    counts = await upsertImportedEntries(tx, rows);
    await tx.update(users).set({ psnSyncedAt: now }).where(eq(users.id, userId));
    await bumpRecsVersion(tx, userId);
  });

  return {
    ...counts,
    unmatched: unmatched.slice(0, EXPORT_UNMATCHED_SHOWN),
    unmatchedCount: unmatched.length,
    total: titles.length,
  };
}
