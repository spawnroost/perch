import { and, eq, inArray } from 'drizzle-orm';
import { libraryEntries, users, type Db } from '@perch/db';
import type { IgdbCache } from '../igdb/cache.js';
import type { IgdbClient } from '../igdb/client.js';
import { buildLibraryRow } from '../library/rows.js';
import { bumpRecsVersion } from '../recommendation-cache/version.js';
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

const toHours = (minutes: number) => Math.round((minutes / 60) * 10) / 10;

/**
 * Imports the user's Steam library as PC entries. Existing entries only gain data: hours and
 * last-played never go down, status and source are left alone, owned becomes true.
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
  const existing = new Map(
    ids.length === 0
      ? []
      : (
          await db
            .select()
            .from(libraryEntries)
            .where(
              and(
                eq(libraryEntries.userId, userId),
                eq(libraryEntries.platform, STEAM_PLATFORM),
                inArray(libraryEntries.igdbId, ids),
              ),
            )
        ).map((e) => [e.igdbId, e]),
  );

  let imported = 0;
  let updated = 0;
  await db.transaction(async (tx) => {
    for (const igdbId of ids) {
      const { minutes, lastPlayed } = merged.get(igdbId)!;
      const hours = toHours(minutes);
      const prev = existing.get(igdbId);
      const { insert, update } = buildLibraryRow({
        userId,
        igdbId,
        platform: STEAM_PLATFORM,
        source: 'steam',
        owned: true,
        // Existing rows keep their status and only ever gain hours / a later last-played.
        ...(prev
          ? {
              hours: hours > (prev.hoursPlayed ?? 0) ? hours : undefined,
              lastPlayed:
                lastPlayed && (!prev.lastPlayed || lastPlayed > prev.lastPlayed)
                  ? lastPlayed
                  : undefined,
            }
          : {
              hours,
              lastPlayed: lastPlayed ?? undefined,
              status: steamImportStatus({ minutes, lastPlayed, now }),
            }),
      });
      await tx
        .insert(libraryEntries)
        .values(insert)
        .onConflictDoUpdate({
          target: [libraryEntries.userId, libraryEntries.igdbId, libraryEntries.platform],
          set: update,
        });
      if (prev) updated++;
      else imported++;
    }
    await tx.update(users).set({ steamSyncedAt: now }).where(eq(users.id, userId));
    await bumpRecsVersion(tx, userId);
  });

  return { imported, updated, unmatched: owned.length - ids.length, total: owned.length };
}
