import { GOG_SOURCE_ID, type IgdbClient } from '../igdb/client.js';
import type { NamedGame } from '../igdb/schemas.js';
import { normaliseName } from '../library/match.js';
import type { ExportGame } from './schemas.js';

const MAIN_GAME = 0;

/**
 * Main games first, then the most rated (same-name games are usually one famous title and
 * obscure namesakes, e.g. Hades 2020 vs 1995), then the earliest release, then the lowest id.
 */
function better(a: NamedGame, b: NamedGame): NamedGame {
  const main = (g: NamedGame) => (g.gameType === MAIN_GAME ? 0 : 1);
  if (main(a) !== main(b)) return main(a) < main(b) ? a : b;
  const ra = a.ratingCount ?? 0;
  const rb = b.ratingCount ?? 0;
  if (ra !== rb) return ra > rb ? a : b;
  const ta = a.firstRelease?.getTime() ?? Infinity;
  const tb = b.firstRelease?.getTime() ?? Infinity;
  if (ta !== tb) return ta < tb ? a : b;
  return a.igdbId <= b.igdbId ? a : b;
}

/**
 * IGDB id per title, keyed by `normaliseName(title)` (unmatched titles are absent). Exact-name
 * query in batches, compared normalised, the best same-name game wins. No fuzzy search: a wrong
 * match is worse than a reported miss. Shared by the export-file and Xbox imports.
 */
export async function resolveExactNames(
  client: Pick<IgdbClient, 'gamesByExactName'>,
  titles: readonly string[],
): Promise<Map<string, number>> {
  const unique = [...new Set(titles)];
  const best = new Map<string, NamedGame>();
  if (unique.length) {
    for (const row of await client.gamesByExactName(unique)) {
      const key = normaliseName(row.name);
      const cur = best.get(key);
      best.set(key, cur ? better(cur, row) : row);
    }
  }
  return new Map([...best].map(([key, g]) => [key, g.igdbId]));
}

/**
 * IGDB id per game (null when not found), in input order. GOG product ids go through IGDB's
 * `external_games`; everything else, and GOG ids IGDB does not know, by exact title.
 */
export async function resolveExportGames(
  client: Pick<IgdbClient, 'externalGameIds' | 'gamesByExactName'>,
  games: readonly ExportGame[],
): Promise<(number | null)[]> {
  const gogIds = [
    ...new Set(games.flatMap((g) => (g.source === 'gog' && g.storeId ? [g.storeId] : []))),
  ];
  const byStoreId = gogIds.length
    ? await client.externalGameIds(GOG_SOURCE_ID, gogIds)
    : new Map<string, number>();
  const byStore = (g: ExportGame) =>
    g.source === 'gog' && g.storeId ? (byStoreId.get(g.storeId) ?? null) : null;

  const byName = await resolveExactNames(
    client,
    games.filter((g) => byStore(g) === null).map((g) => g.title),
  );
  return games.map((g) => byStore(g) ?? byName.get(normaliseName(g.title)) ?? null);
}
