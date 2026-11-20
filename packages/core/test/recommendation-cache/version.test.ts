import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createDb, games, runMigrations, users, type Db } from '@perch/db';
import {
  addDevice,
  addFeedback,
  deleteDevice,
  deleteLibraryEntry,
  importLibraryGames,
  listLibrary,
  removeFeedback,
  updateDevice,
  setGameRating,
  updateLibraryEntry,
  upsertLibraryGame,
  type Game,
} from '../../src/index.js';

const url = process.env.DATABASE_URL_TEST;
if (!url) console.warn('[skip] DATABASE_URL_TEST is not set; recs version tests skipped');

const USER = 'recs-version-test-user';
const G = 987654401;
const G2 = 987654402;

describe.skipIf(!url)('recs_version', () => {
  let db: Db;
  const game = (id: number) =>
    ({
      igdbId: id,
      name: `G${id}`,
      slug: `g${id}`,
      genres: [12],
      themes: [],
      keywords: [],
      perspectives: [],
      gameModes: [],
      platforms: [6],
      similarIds: [],
      series: [],
      coverUrl: null,
      coverUrlSmall: null,
      heroUrl: null,
      accent: null,
      summary: null,
      firstRelease: null,
      rating: null,
      ratingCount: null,
      steamAppId: null,
      criticRating: null,
      criticRatingCount: null,
      websites: [],
      developers: [],
      publishers: [],
      multiplayer: null,
      dlcCount: 0,
      expansionCount: 0,
      seriesName: null,
    }) satisfies Game;
  const cache = {
    async getGame(id: number) {
      return game(id);
    },
    async getGames(ids: number[]) {
      return ids.map(game);
    },
  };
  const deps = () => ({ db, cache: cache as never, mapVocab: () => ({}) });
  const version = async () =>
    (await db.select({ v: users.recsVersion }).from(users).where(eq(users.id, USER)))[0]!.v;
  /** Runs a write; returns how much the version moved. */
  async function bump(write: () => Promise<unknown>) {
    const before = await version();
    await write();
    return (await version()) - before;
  }

  beforeAll(async () => {
    await runMigrations(url!);
    db = createDb(url!);
    await db.delete(users).where(eq(users.id, USER));
    await db.insert(users).values({ id: USER, name: 'T', email: 'recs-version@test.local' });
  });
  afterAll(async () => {
    await db?.delete(users).where(eq(users.id, USER));
    await db?.delete(games).where(eq(games.igdbId, G));
    await db?.delete(games).where(eq(games.igdbId, G2));
    await db?.$client.end({ timeout: 1 });
  });

  it('starts at 0', async () => {
    expect(await version()).toBe(0);
  });

  it('library writes bump it', async () => {
    const input = { igdbId: G, platform: 'pc', hours: 3 };
    expect(await bump(() => upsertLibraryGame(deps(), USER, input, 'manual'))).toBe(1);
    const [entry] = await listLibrary(db, USER);
    expect(await bump(() => updateLibraryEntry(db, USER, entry!.id, { hoursPlayed: 9 }))).toBe(1);
    expect(await bump(() => updateLibraryEntry(db, USER, entry!.id, { rating: 4 }))).toBe(1);
    expect(await bump(() => updateLibraryEntry(db, USER, entry!.id, { rating: null }))).toBe(1);
    expect(
      await bump(() =>
        importLibraryGames(deps(), USER, { platform: 'pc', items: [{ igdbId: G2 }] }),
      ),
    ).toBeGreaterThan(0);
    expect(await bump(() => deleteLibraryEntry(db, USER, entry!.id))).toBe(1);
  });

  it('setGameRating rates every platform entry and bumps once', async () => {
    await upsertLibraryGame(deps(), USER, { igdbId: G, platform: 'pc' }, 'manual');
    await upsertLibraryGame(deps(), USER, { igdbId: G, platform: 'ps5' }, 'manual');
    expect(await bump(() => setGameRating(db, USER, G, 5))).toBe(1);
    const rows = (await listLibrary(db, USER)).filter((r) => r.igdbId === G);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.rating)).toEqual([5, 5]);
    expect(await bump(() => setGameRating(db, USER, G, null))).toBe(1);
    expect(
      (await listLibrary(db, USER)).filter((r) => r.igdbId === G).map((r) => r.rating),
    ).toEqual([null, null]);
    expect(await bump(() => setGameRating(db, USER, 987654999, 3))).toBe(0);
    expect(await setGameRating(db, USER, 987654999, 3)).toBe(0);
    await deleteLibraryEntry(db, USER, rows[0]!.id);
    await deleteLibraryEntry(db, USER, rows[1]!.id);
  });

  it('feedback writes bump it', async () => {
    expect(await bump(() => addFeedback({ db, cache }, USER, G, 'up'))).toBe(1);
    expect(await bump(() => removeFeedback(db, USER, G, 'up'))).toBe(1);
  });

  it('device writes bump it', async () => {
    let id = '';
    expect(
      await bump(async () => {
        id = (await addDevice(db, USER, { preset: 'ps5' })).id;
      }),
    ).toBe(1);
    expect(await bump(() => updateDevice(db, USER, id, { isDefault: true }))).toBe(1);
    expect(await bump(() => deleteDevice(db, USER, id))).toBe(1);
  });

  it('writes that change nothing do not bump it', async () => {
    const missing = crypto.randomUUID();
    expect(await bump(() => updateLibraryEntry(db, USER, missing, { hoursPlayed: 1 }))).toBe(0);
    expect(await bump(() => deleteLibraryEntry(db, USER, missing))).toBe(0);
    expect(await bump(() => updateDevice(db, USER, missing, { name: 'x' }))).toBe(0);
    expect(await bump(() => deleteDevice(db, USER, missing))).toBe(0);
  });
});
