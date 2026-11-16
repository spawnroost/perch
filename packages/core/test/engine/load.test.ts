import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createDb, games, libraryEntries, runMigrations, users, type Db } from '@perch/db';
import { loadRecommendInput } from '../../src/engine/load.js';

const url = process.env.DATABASE_URL_TEST;
if (!url) console.warn('[skip] DATABASE_URL_TEST is not set; engine load tests skipped');

const USER = 'engine-load-test-user';
const GAME = 987654321;

describe.skipIf(!url)('loadRecommendInput', () => {
  let db: Db;
  beforeAll(async () => {
    await runMigrations(url!);
    db = createDb(url!);
    await db.delete(users).where(eq(users.id, USER));
    await db.delete(games).where(eq(games.igdbId, GAME));
    await db.insert(users).values({ id: USER, name: 'T', email: 'engine-load@test.local' });
    await db
      .insert(games)
      .values({ igdbId: GAME, name: 'Stale', slug: 'stale', genres: [12], vocab: { old: 1 } });
    await db.insert(libraryEntries).values({ userId: USER, igdbId: GAME, platform: 'pc' });
  });
  afterAll(async () => {
    await db?.delete(users).where(eq(users.id, USER));
    await db?.delete(games).where(eq(games.igdbId, GAME));
    await db?.$client.end({ timeout: 1 });
  });

  it('computes library vocab fresh with mapVocab instead of trusting games.vocab', async () => {
    const { library } = await loadRecommendInput(db, USER, (g) => ({ [`g${g.genres[0]}`]: 1 }));
    expect(library).toHaveLength(1);
    expect(library[0]!.game.vocab).toEqual({ g12: 1 });
  });
});
