import { createIgdbCache, createIgdbClientFromEnv } from '@perch/core';
import type { Db } from '@perch/db';
import { mapGame } from '@perch/taste-vocab';

/** Resolves `<game name or igdb id>` to a cached game; throws when IGDB has no match. */
export async function resolveGame(db: Db, query: string) {
  const client = createIgdbClientFromEnv();
  const cache = createIgdbCache({ db, client, mapVocab: mapGame });
  const igdbId = /^\d+$/.test(query)
    ? Number(query)
    : (await client.searchGames(query)).best?.igdbId;
  const game = igdbId === undefined ? null : await cache.getGame(igdbId);
  if (!game) throw new Error(`no IGDB match for "${query}"`);
  return game;
}
