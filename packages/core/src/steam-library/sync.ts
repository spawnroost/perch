import { eq } from 'drizzle-orm';
import { users, type Db } from '@perch/db';
import type { IgdbCache } from '../igdb/cache.js';
import type { IgdbClient } from '../igdb/client.js';
import { minutesToHours, upsertImportedEntries } from '../library/bulk.js';
import { isPlayedBefore } from '../library/played-before.js';
import { buildLibraryRow } from '../library/rows.js';
import { bumpRecsVersion } from '../recommendation-cache/version.js';
import { SteamAccountChangedError } from './errors.js';
import { resolveSteamAppIds } from './map.js';
import type { OwnedGame, SteamSyncResult } from './schemas.js';
import { steamImportStatus } from './status.js';

export const STEAM_PLATFORM = 'pc';

export interface SteamSyncDeps {
  db: Db;
  cache: Pick<IgdbCache, 'getGames'>;
  client: Pick<IgdbClient, 'steamAppIds'>;
  /** Wraps fetchOwnedGames with the API key (and a stub in tests). */
  fetchOwned: (steamId: string) => Promise<OwnedGame[]>;
  now?: () => Date;
}

/**
 * Imports the user's Steam library as PC entries. Existing entries only gain data: hours and
 * last-played never go down, status and source are left alone, owned becomes true. Writes
 * nothing if the user's linked Steam id is no longer `steamId` by the time it writes.
 */
export async function syncSteamLibrary(
  deps: SteamSyncDeps,
  userId: string,
  steamId: string,
): Promise<SteamSyncResult> {
  const { db, cache } = deps;
  const now = (deps.now ?? (() => new Date()))();
  const owned = await deps.fetchOwned(steamId);
  const map = await resolveSteamAppIds(
    deps,
    owned.map((g) => g.appid),
  );

  // Several appids can map to one IGDB game (editions, DLC): add their playtime together.
  const merged = new Map<number, { minutes: number; lastPlayed: Date | null }>();
  for (const g of owned) {
    const igdbId = map.get(g.appid);
    if (igdbId === undefined) continue;
    const cur = merged.get(igdbId) ?? { minutes: 0, lastPlayed: null };
    cur.minutes += g.playtimeMinutes;
    if (g.lastPlayed && (!cur.lastPlayed || g.lastPlayed > cur.lastPlayed))
      cur.lastPlayed = g.lastPlayed;
    merged.set(igdbId, cur);
  }

  const found = new Set((await cache.getGames([...merged.keys()])).map((g) => g.igdbId));
  const ids = [...merged.keys()].filter((id) => found.has(id));
  const unmatched = owned.filter((g) => {
    const igdbId = map.get(g.appid);
    return igdbId === undefined || !found.has(igdbId);
  }).length;

  const rows = ids.map((igdbId) => {
    const { minutes, lastPlayed } = merged.get(igdbId)!;
    // Status and the played-before flag only apply to a new row: the conflict update never touches them.
    const status = steamImportStatus({ minutes, lastPlayed, now });
    const row = buildLibraryRow({
      userId,
      igdbId,
      platform: STEAM_PLATFORM,
      source: 'steam',
      owned: true,
      hours: minutes > 0 ? minutesToHours(minutes) : undefined,
      lastPlayed: lastPlayed ?? undefined,
      status,
    }).insert;
    row.playedBeforePending = isPlayedBefore({ status, minutes, lastPlayed });
    return row;
  });

  let imported = 0;
  let updated = 0;
  await db.transaction(async (tx) => {
    const [owner] = await tx
      .select({ steamId: users.steamId })
      .from(users)
      .where(eq(users.id, userId))
      .for('update');
    if (owner?.steamId !== steamId) throw new SteamAccountChangedError();

    ({ imported, updated } = await upsertImportedEntries(tx, rows));
    await tx.update(users).set({ steamSyncedAt: now }).where(eq(users.id, userId));
    await bumpRecsVersion(tx, userId);
  });

  return { imported, updated, unmatched, total: owned.length };
}
