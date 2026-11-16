import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  createDb,
  feedback,
  games,
  libraryEntries,
  runMigrations,
  tasteProfiles,
  users,
  type Db,
} from '@perch/db';
import { addFeedback, rebuildProfile } from '../../src/feedback/index.js';
import type { Game } from '../../src/index.js';

const url = process.env.DATABASE_URL_TEST;
if (!url) console.warn('[skip] DATABASE_URL_TEST is not set; feedback tests skipped');

const USER = 'feedback-test-user';
const G1 = 987654331;
const G2 = 987654332;
const NOW = new Date('2026-11-16T00:00:00Z');
const mapVocab = (g: { genres: number[] }) => ({ [`g${g.genres[0]}`]: 1 });

describe.skipIf(!url)('feedback + rebuildProfile', () => {
  let db: Db;
  const fetched: number[] = [];
  // Stands in for the IGDB cache: records the lookup and writes the games row like the real one.
  const cache = {
    async getGame(id: number) {
      fetched.push(id);
      await db
        .insert(games)
        .values({ igdbId: id, name: `G${id}`, slug: `g${id}`, genres: [id === G1 ? 12 : 31] })
        .onConflictDoNothing();
      return { igdbId: id } as Game;
    },
  };
  const kinds = async (id: number) =>
    (await db.select().from(feedback).where(eq(feedback.igdbId, id))).map((f) => f.kind).sort();

  beforeAll(async () => {
    await runMigrations(url!);
    db = createDb(url!);
    await db.delete(users).where(eq(users.id, USER));
    await db.delete(games).where(eq(games.igdbId, G1));
    await db.delete(games).where(eq(games.igdbId, G2));
    await db.insert(users).values({ id: USER, name: 'T', email: 'feedback@test.local' });
  });
  afterAll(async () => {
    await db?.delete(users).where(eq(users.id, USER));
    await db?.delete(games).where(eq(games.igdbId, G1));
    await db?.delete(games).where(eq(games.igdbId, G2));
    await db?.$client.end({ timeout: 1 });
  });

  it('fetches the game into the cache, then stores the feedback', async () => {
    await addFeedback({ db, cache }, USER, G1, 'up');
    expect(fetched).toContain(G1);
    expect(await kinds(G1)).toEqual(['up']);
  });

  it('a later up/down replaces the earlier vote instead of stacking', async () => {
    await addFeedback({ db, cache }, USER, G1, 'up');
    expect(await kinds(G1)).toEqual(['up']);
    await addFeedback({ db, cache }, USER, G1, 'down');
    expect(await kinds(G1)).toEqual(['down']);
  });

  it('played and not_interested are kept alongside a vote, once each', async () => {
    await addFeedback({ db, cache }, USER, G1, 'played');
    await addFeedback({ db, cache }, USER, G1, 'played');
    await addFeedback({ db, cache }, USER, G1, 'not_interested');
    expect(await kinds(G1)).toEqual(['down', 'not_interested', 'played']);
  });

  it('rebuildProfile upserts one row built from library + feedback', async () => {
    await db
      .insert(games)
      .values({ igdbId: G2, name: 'G2', slug: 'g2', genres: [31] })
      .onConflictDoNothing();
    await db
      .insert(libraryEntries)
      .values({ userId: USER, igdbId: G2, platform: 'pc', hoursPlayed: 10, lastPlayed: NOW });
    await rebuildProfile(db, USER, NOW, mapVocab);
    await rebuildProfile(db, USER, NOW, mapVocab);
    const rows = await db.select().from(tasteProfiles).where(eq(tasteProfiles.userId, USER));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.vocab).toEqual({ g31: 1 });
    expect(rows[0]!.genres).toEqual({ '31': 1 });
    expect(rows[0]!.builtAt.getTime()).toBeGreaterThan(0);
  });
});
