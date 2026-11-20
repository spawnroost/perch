import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { createDb, games, libraryEntries, runMigrations, users, type Db } from '@perch/db';
import {
  claimAutoSync,
  createIgdbCache,
  releaseAutoSync,
  syncPsnLibrary,
  PsnAccountChangedError,
  type Game,
  type IgdbCache,
  type IgdbClient,
  type PsnTitle,
} from '../../src/index.js';

const url = process.env.DATABASE_URL_TEST;
if (!url) console.warn('[skip] DATABASE_URL_TEST is not set; psn sync tests skipped');

const USER = 'psn-sync-test-user';
const ACCOUNT = '5550001';
const A = 987659001;
const B = 987659002;
const IDS = [A, B];
const NAMES: Record<string, number> = { 'Psn Alpha': A, 'Psn Beta': B };

const game = (igdbId: number): Game =>
  ({
    igdbId,
    name: `X${igdbId}`,
    slug: `x${igdbId}`,
    genres: [12],
    themes: [],
    keywords: [],
    perspectives: [],
    gameModes: [],
    platforms: [167],
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
  }) as Game;

const title = (
  name: string,
  platform: 'ps4' | 'ps5',
  minutes: number,
  lastPlayed: Date | null,
  titleId = name,
): PsnTitle => ({ titleId, name, platform, minutes, lastPlayed });

describe.skipIf(!url)('syncPsnLibrary', () => {
  let db: Db;
  let cache: IgdbCache;
  let nameCalls: (readonly string[])[] = [];
  const now = new Date('2026-06-01T00:00:00Z');
  const client = {
    async searchGames() {
      return { best: null, candidates: [] };
    },
    async getGame(id: number) {
      return IDS.includes(id) ? game(id) : null;
    },
    async getGames(ids: readonly number[]) {
      return ids.filter((i) => IDS.includes(i)).map(game);
    },
    async queryByTags() {
      return [];
    },
    async getTimeToBeat() {
      return null;
    },
    async externalGameIds() {
      return new Map();
    },
    async gamesByExactName(names: readonly string[]) {
      nameCalls.push(names);
      return names
        .filter((n) => NAMES[n])
        .map((n) => ({ igdbId: NAMES[n]!, name: n, gameType: 0, firstRelease: null }));
    },
    async keywordNames() {
      return {};
    },
    async steamAppIds() {
      return new Map();
    },
  } as unknown as IgdbClient;

  let list: PsnTitle[] = [];
  const deps = () => ({ db, cache, client, fetchTitles: async () => list, now: () => now });

  beforeAll(async () => {
    await runMigrations(url!);
    db = createDb(url!);
    cache = createIgdbCache({ db, client, mapVocab: () => ({}), accentFor: async () => null });
    await db
      .insert(users)
      .values({ id: USER, name: 'x', email: 'psn-sync@test.dev' })
      .onConflictDoNothing();
  });
  beforeEach(async () => {
    nameCalls = [];
    list = [
      title('Psn Alpha', 'ps5', 100, new Date('2026-05-30T00:00:00Z')),
      title('Psn Alpha', 'ps5', 50, new Date('2026-05-31T00:00:00Z'), 'alpha-2'),
      title('Psn Alpha', 'ps4', 30, new Date('2026-05-29T00:00:00Z'), 'alpha-ps4'),
      title('Psn Beta', 'ps4', 600, new Date('2020-01-01T00:00:00Z')),
      title('Unknown Game', 'ps4', 0, null),
    ];
    await db.delete(libraryEntries).where(eq(libraryEntries.userId, USER));
    await db
      .update(users)
      .set({ psnAccountId: ACCOUNT, psnOnlineId: 'Tag', psnSyncedAt: null, recsVersion: 0 })
      .where(eq(users.id, USER));
  });
  afterAll(async () => {
    await db.delete(users).where(eq(users.id, USER));
    await db.delete(games).where(inArray(games.igdbId, IDS));
    await db.$client.end({ timeout: 1 });
  });

  const rows = () => db.select().from(libraryEntries).where(eq(libraryEntries.userId, USER));
  const user = async () => (await db.select().from(users).where(eq(users.id, USER)))[0]!;

  it('imports by name per platform, adds playtime of editions, sets status, lists unmatched', async () => {
    const res = await syncPsnLibrary(deps(), USER, ACCOUNT);
    expect(res).toEqual({
      imported: 3,
      updated: 0,
      unmatched: ['Unknown Game'],
      unmatchedCount: 1,
      total: 5,
    });
    const all = await rows();
    const find = (id: number, platform: string) =>
      all.find((r) => r.igdbId === id && r.platform === platform)!;
    // Both PS5 editions of Alpha collapse into one entry: 150 min = 2.5 h, newest last-played.
    expect(find(A, 'ps5')).toMatchObject({
      source: 'psn',
      owned: true,
      status: 'playing',
      hoursPlayed: 2.5,
    });
    expect(find(A, 'ps5').lastPlayed?.toISOString()).toBe('2026-05-31T00:00:00.000Z');
    expect(find(A, 'ps4')).toMatchObject({ status: 'playing', hoursPlayed: 0.5 });
    expect(find(B, 'ps4')).toMatchObject({ status: 'backlog', hoursPlayed: 10 });
    // Beta: 10 h, long ago: the user is asked about it. Alpha was recent.
    expect(find(B, 'ps4').playedBeforePending).toBe(true);
    expect(find(A, 'ps5').playedBeforePending).toBe(false);
    const u = await user();
    expect(u.psnSyncedAt).toEqual(now);
    expect(u.recsVersion).toBeGreaterThan(0);
  });

  it('does not flag a short try-out as played before', async () => {
    list = [title('Psn Beta', 'ps4', 20, new Date('2020-01-01T00:00:00Z'))];
    await syncPsnLibrary(deps(), USER, ACCOUNT);
    expect((await rows())[0]).toMatchObject({ status: 'backlog', playedBeforePending: false });
  });

  it('a resync never raises the played-before flag on an entry the user already decided on', async () => {
    await syncPsnLibrary(deps(), USER, ACCOUNT);
    await db
      .update(libraryEntries)
      .set({ playedBeforePending: false })
      .where(eq(libraryEntries.userId, USER));
    await syncPsnLibrary(deps(), USER, ACCOUNT);
    expect((await rows()).some((r) => r.playedBeforePending)).toBe(false);
  });

  it('only gains data on a resync: status stays, hours and last-played never go down', async () => {
    await syncPsnLibrary(deps(), USER, ACCOUNT);
    await db
      .update(libraryEntries)
      .set({ status: 'finished', hoursPlayed: 12 })
      .where(eq(libraryEntries.userId, USER));
    list = [title('Psn Alpha', 'ps5', 60, new Date('2026-05-20T00:00:00Z'))];
    const res = await syncPsnLibrary(deps(), USER, ACCOUNT);
    expect(res).toMatchObject({ imported: 0, updated: 1, total: 1, unmatchedCount: 0 });
    const a = (await rows()).find((r) => r.igdbId === A && r.platform === 'ps5')!;
    expect(a).toMatchObject({ status: 'finished', hoursPlayed: 12 });
    expect(a.lastPlayed?.toISOString()).toBe('2026-05-31T00:00:00.000Z');
    // More playtime does raise it.
    list = [title('Psn Alpha', 'ps5', 20 * 60, new Date('2026-05-31T12:00:00Z'))];
    await syncPsnLibrary(deps(), USER, ACCOUNT);
    const b = (await rows()).find((r) => r.igdbId === A && r.platform === 'ps5')!;
    expect(b.hoursPlayed).toBe(20);
    expect(b.lastPlayed?.toISOString()).toBe('2026-05-31T12:00:00.000Z');
  });

  it('writes nothing when the linked account changed during the import', async () => {
    await expect(syncPsnLibrary(deps(), USER, 'someone-else')).rejects.toBeInstanceOf(
      PsnAccountChangedError,
    );
    expect(await rows()).toHaveLength(0);
    expect((await user()).psnSyncedAt).toBeNull();
  });

  it('claims the PSN auto-sync slot once and gives it back on release', async () => {
    const first = await claimAutoSync(db, USER, now, 'psnSyncedAt');
    expect(first.claimed).toBe(true);
    expect((await claimAutoSync(db, USER, now, 'psnSyncedAt')).claimed).toBe(false);
    // The Steam slot is independent.
    expect((await claimAutoSync(db, USER, now)).claimed).toBe(true);
    await releaseAutoSync(db, USER, first, 'psnSyncedAt');
    expect((await user()).psnSyncedAt).toBeNull();
    await db.update(users).set({ steamSyncedAt: null }).where(eq(users.id, USER));
  });
});
