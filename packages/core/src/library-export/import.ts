import type { Db } from '@perch/db';
import type { IgdbCache } from '../igdb/cache.js';
import type { IgdbClient } from '../igdb/client.js';
import { minutesToHours, upsertImportedEntries } from '../library/bulk.js';
import { isPlayedBefore } from '../library/played-before.js';
import { buildLibraryRow } from '../library/rows.js';
import { bumpRecsVersion } from '../recommendation-cache/version.js';
import { steamImportStatus } from '../steam-library/status.js';
import { resolveExportGames } from './resolve.js';
import { EXPORT_UNMATCHED_SHOWN, type ExportGame, type ExportImportResult } from './schemas.js';

export interface ExportImportDeps {
  db: Db;
  cache: Pick<IgdbCache, 'getGames'>;
  client: Pick<IgdbClient, 'externalGameIds' | 'gamesByExactName'>;
  now?: () => Date;
}

const platformOf = (source: ExportGame['source']) => (source === 'other' ? 'pc' : source);

/**
 * Imports games read from export files as library entries on Epic, GOG or PC. Same rules as the
 * Steam sync: an existing entry only gains hours and last-played, a new one is playing when played
 * in the last 30 days and backlog otherwise. Games IGDB cannot match are listed, not guessed.
 */
export async function importExportGames(
  deps: ExportImportDeps,
  userId: string,
  games: readonly ExportGame[],
): Promise<ExportImportResult> {
  const { db, cache } = deps;
  const now = (deps.now ?? (() => new Date()))();
  const ids = await resolveExportGames(deps.client, games);
  const known = new Set(
    (await cache.getGames([...new Set(ids.filter((i): i is number => i !== null))])).map(
      (g) => g.igdbId,
    ),
  );

  // Editions of one game on one store collapse into one entry: playtime adds up.
  const merged = new Map<
    string,
    { igdbId: number; platform: string; minutes: number; lastPlayed: Date | null }
  >();
  const unmatched: string[] = [];
  games.forEach((g, i) => {
    const igdbId = ids[i];
    if (igdbId === null || igdbId === undefined || !known.has(igdbId)) {
      unmatched.push(g.title);
      return;
    }
    const platform = platformOf(g.source);
    const key = `${igdbId}:${platform}`;
    const cur = merged.get(key) ?? { igdbId, platform, minutes: 0, lastPlayed: null };
    cur.minutes += g.minutesPlayed ?? 0;
    const last = g.lastPlayed ? new Date(g.lastPlayed) : null;
    if (last && (!cur.lastPlayed || last > cur.lastPlayed)) cur.lastPlayed = last;
    merged.set(key, cur);
  });

  const rows = [...merged.values()].map(({ igdbId, platform, minutes, lastPlayed }) => {
    const status = steamImportStatus({ minutes, lastPlayed, now });
    const row = buildLibraryRow({
      userId,
      igdbId,
      platform,
      source: 'import',
      owned: true,
      hours: minutes > 0 ? minutesToHours(minutes) : undefined,
      lastPlayed: lastPlayed ?? undefined,
      status,
    }).insert;
    row.playedBeforePending = isPlayedBefore({
      status,
      minutes: minutes > 0 ? minutes : undefined,
      lastPlayed,
    });
    return row;
  });

  let counts = { imported: 0, updated: 0 };
  await db.transaction(async (tx) => {
    counts = await upsertImportedEntries(tx, rows);
    // Importing nothing must not touch the user row; the bump is only for changed libraries.
    if (rows.length) await bumpRecsVersion(tx, userId);
  });

  return {
    ...counts,
    unmatched: unmatched.slice(0, EXPORT_UNMATCHED_SHOWN),
    unmatchedCount: unmatched.length,
    total: games.length,
  };
}
