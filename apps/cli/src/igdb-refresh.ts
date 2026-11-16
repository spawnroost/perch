import { createIgdbCache, createIgdbClientFromEnv } from '@perch/core';
import { createDb } from '@perch/db';
import { mapGame } from '@perch/taste-vocab';

/** Refetches every cached game from IGDB (batches of 500) and upserts it, vocab included. */
export async function igdbRefresh(databaseUrl: string): Promise<string> {
  const db = createDb(databaseUrl);
  try {
    const cache = createIgdbCache({ db, client: createIgdbClientFromEnv(), mapVocab: mapGame });
    return `refreshed ${await cache.refreshAll()} games from IGDB`;
  } finally {
    await db.$client.end();
  }
}
