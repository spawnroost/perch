import { inArray, sql } from 'drizzle-orm';
import { steamAppMap, type Db } from '@perch/db';
import { IGDB_MAX_LIMIT, type IgdbClient } from '../igdb/client.js';

/** How long a miss is trusted before IGDB is asked again. */
export const MISS_RETRY_MS = 7 * 86_400_000;
const CHUNK = 5000;

/**
 * appid -> IGDB id for the given appids (unmatched ones are absent). Stored matches are final,
 * stored misses are retried after 7 days, unknown appids go to IGDB in batches of 500, each
 * stored as soon as it completes so a later failure keeps the earlier batches.
 */
export async function resolveSteamAppIds(
  deps: { db: Db; client: Pick<IgdbClient, 'steamAppIds'>; now?: () => Date },
  appids: readonly number[],
): Promise<Map<number, number>> {
  const { db, client } = deps;
  const now = (deps.now ?? (() => new Date()))();
  const unique = [...new Set(appids)];
  const out = new Map<number, number>();
  const known = new Set<number>();
  for (let i = 0; i < unique.length; i += CHUNK) {
    const rows = await db
      .select()
      .from(steamAppMap)
      .where(inArray(steamAppMap.appid, unique.slice(i, i + CHUNK)));
    for (const r of rows) {
      if (r.igdbId !== null) {
        out.set(r.appid, r.igdbId);
        known.add(r.appid);
      } else if (now.getTime() - r.checkedAt.getTime() < MISS_RETRY_MS) {
        known.add(r.appid);
      }
    }
  }
  const lookup = unique.filter((a) => !known.has(a));
  for (let i = 0; i < lookup.length; i += IGDB_MAX_LIMIT) {
    const batch = lookup.slice(i, i + IGDB_MAX_LIMIT);
    const found = await client.steamAppIds(batch);
    await db
      .insert(steamAppMap)
      .values(batch.map((appid) => ({ appid, igdbId: found.get(appid) ?? null, checkedAt: now })))
      .onConflictDoUpdate({
        target: steamAppMap.appid,
        set: { igdbId: sql`excluded.igdb_id`, checkedAt: sql`excluded.checked_at` },
      });
    for (const [appid, igdbId] of found) out.set(appid, igdbId);
  }
  return out;
}
