import { createAccentFetcher, createIgdbCache, createIgdbClientFromEnv } from '@perch/core';
import { createDb, type Db } from '@perch/db';
import { mapGame } from '@perch/taste-vocab';

/** Refetches every cached game from IGDB and upserts it, vocab included. */
export async function igdbRefresh(databaseUrl: string): Promise<string> {
  const db = createDb(databaseUrl);
  try {
    const cache = makeCache(db);
    const { refreshed, missing } = await cache.refreshAll();
    return `refreshed ${refreshed} games from IGDB, ${missing.length} missing`;
  } finally {
    await db.$client.end();
  }
}

/** Fills hero art and the accent colour for cached games that lack them. */
export async function igdbBackfillArt(databaseUrl: string): Promise<string> {
  const db = createDb(databaseUrl);
  try {
    const { checked, updated } = await makeCache(db).backfillArt();
    return `checked ${checked} games missing art, filled ${updated}`;
  } finally {
    await db.$client.end();
  }
}

const makeCache = (db: Db) =>
  createIgdbCache({
    db,
    client: createIgdbClientFromEnv(),
    mapVocab: mapGame,
    accentFor: createAccentFetcher(),
  });
