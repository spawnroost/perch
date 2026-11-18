import { createAccentFetcher, createIgdbCache, createIgdbClientFromEnv } from '@perch/core';
import { createDb, type Db } from '@perch/db';
import { mapGame } from '@perch/taste-vocab';

/** Refetches every cached game from IGDB and upserts it, vocab included. */
export async function igdbRefresh(databaseUrl: string): Promise<string> {
  const db = createDb(databaseUrl);
  try {
    const cache = makeCache(db);
    const { refreshed, missing } = await cache.refreshAll();
    await cache.idle(); // accent downloads run in the background
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

/** Fetches critic rating and store links for cached games that lack them. */
export async function igdbBackfillFacts(databaseUrl: string): Promise<string> {
  const db = createDb(databaseUrl);
  try {
    const cache = makeCache(db);
    const { checked, updated } = await cache.backfillFacts();
    await cache.idle(); // accent downloads run in the background
    return `checked ${checked} games missing critic/store data, filled ${updated}`;
  } finally {
    await db.$client.end();
  }
}

/** Fetches time-to-beat for cached games that have no row yet (IGDB limits calls to 4 a second). */
export async function igdbBackfillTimeToBeat(databaseUrl: string): Promise<string> {
  const db = createDb(databaseUrl);
  try {
    const cache = makeCache(db);
    const { checked, updated } = await cache.backfillTimeToBeat();
    await cache.idle();
    return `checked ${checked} games without time to beat, filled ${updated}`;
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
