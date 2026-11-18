import { inArray, sql } from 'drizzle-orm';
import { steamAppMap, type Db } from '@perch/db';
import type { IgdbClient } from '../igdb/client.js';

/** How long a miss is trusted before IGDB is asked again. */
export const MISS_RETRY_MS = 7 * 86_400_000;
const CHUNK = 5000;

/**
 * appid -> IGDB id for the given appids (unmatched ones are absent). Stored matches are final,
 * stored misses are retried after 7 days, unknown appids go to IGDB in one batched lookup.
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
  if (lookup.length === 0) return out;

  const found = await client.steamAppIds(lookup);
  const rows = lookup.map((appid) => ({ appid, igdbId: found.get(appid) ?? null, checkedAt: now }));
  for (let i = 0; i < rows.length; i += CHUNK) {
    await db
      .insert(steamAppMap)
      .values(rows.slice(i, i + CHUNK))
      .onConflictDoUpdate({
        target: steamAppMap.appid,
        set: { igdbId: sql`excluded.igdb_id`, checkedAt: sql`excluded.checked_at` },
      });
  }
  for (const [appid, igdbId] of found) out.set(appid, igdbId);
  return out;
}
