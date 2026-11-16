import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { createDb, games, runMigrations, type Db } from '@perch/db';
import { rebuildVocab } from '../../src/library/vocab-rebuild.js';

const url = process.env.DATABASE_URL_TEST;
if (!url) console.warn('[skip] DATABASE_URL_TEST is not set; vocab rebuild tests skipped');

const IDS = [9_100_001, 9_100_002];

describe.skipIf(!url)('rebuildVocab', () => {
  let db: Db;
  beforeAll(async () => {
    await runMigrations(url!);
    db = createDb(url!);
  });
  afterAll(async () => {
    await db?.$client.end({ timeout: 1 });
  });
  beforeEach(async () => {
    await db.delete(games).where(inArray(games.igdbId, IDS));
    await db.insert(games).values(
      IDS.map((igdbId) => ({
        igdbId,
        name: `g${igdbId}`,
        slug: `g${igdbId}`,
        perspectives: [1],
        vocab: { stale: 1 },
      })),
    );
  });

  it('recomputes stored vocab for every row with the given mapper', async () => {
    const seen: number[][] = [];
    const n = await rebuildVocab(db, (g) => {
      seen.push(g.perspectives);
      return { 'first-person': 1 };
    });
    expect(n).toBeGreaterThanOrEqual(IDS.length);
    expect(seen).toContainEqual([1]);
    const rows = await db.select().from(games).where(inArray(games.igdbId, IDS));
    expect(rows.map((r) => r.vocab)).toEqual([{ 'first-person': 1 }, { 'first-person': 1 }]);
  });

  it('skips rows whose vocab is already current', async () => {
    await db
      .update(games)
      .set({ vocab: { 'first-person': 1 } })
      .where(eq(games.igdbId, IDS[0]!));
    const before = await rebuildVocab(db, () => ({ 'first-person': 1 }));
    const after = await rebuildVocab(db, () => ({ 'first-person': 1 }));
    expect(after).toBe(0);
    expect(before).toBeGreaterThanOrEqual(1);
  });
});
