import { createIgdbCache, createIgdbClientFromEnv } from '@perch/core';
import { createDb } from '@perch/db';
import { mapGame } from '@perch/taste-vocab';

/** Refetches every cached game from IGDB and upserts it, vocab included. */
export async function igdbRefresh(databaseUrl: string): Promise<string> {
  const db = createDb(databaseUrl);
  try {
    const cache = createIgdbCache({ db, client: createIgdbClientFromEnv(), mapVocab: mapGame });
    const { refreshed, missing } = await cache.refreshAll();
    return `refreshed ${refreshed} games from IGDB, ${missing.length} missing`;
  } finally {
    await db.$client.end();
  }
}
