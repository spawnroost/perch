import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { createDb, games, libraryEntries, runMigrations, users, type Db } from '@perch/db';
import {
  claimAutoSync,
  createIgdbCache,
  releaseAutoSync,
  syncXboxLibrary,
  XboxAccountChangedError,
  type Game,
  type IgdbCache,
  type IgdbClient,
  type XboxTitle,
} from '../../src/index.js';

const url = process.env.DATABASE_URL_TEST;
if (!url) console.warn('[skip] DATABASE_URL_TEST is not set; xbox sync tests skipped');

const USER = 'xbox-sync-test-user';
const XUID = '2533274800001';
const A = 987656001;
const B = 987656002;
const IDS = [A, B];
const NAMES: Record<string, number> = { 'Xbox Alpha': A, 'Xbox Beta': B };

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
    platforms: [49],
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
  platform: 'xbox' | 'pc',
  lastPlayed: Date | null,
  titleId = name,
  achievementProgress = 0,
): XboxTitle => ({ titleId, name, platform, lastPlayed, achievementProgress });

describe.skipIf(!url)('syncXboxLibrary', () => {
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

  let list: XboxTitle[] = [];
  const deps = () => ({ db, cache, client, fetchTitles: async () => list, now: () => now });

  beforeAll(async () => {
    await runMigrations(url!);
    db = createDb(url!);
    cache = createIgdbCache({ db, client, mapVocab: () => ({}), accentFor: async () => null });
    await db
      .insert(users)
      .values({ id: USER, name: 'x', email: 'xbox-sync@test.dev' })
      .onConflictDoNothing();
  });
  beforeEach(async () => {
    nameCalls = [];
    list = [
      title('Xbox Alpha', 'xbox', new Date('2026-05-30T00:00:00Z')),
      title('Xbox Alpha', 'xbox', new Date('2026-05-31T00:00:00Z'), 'alpha-2'),
      title('Xbox Beta', 'pc', new Date('2020-01-01T00:00:00Z'), 'Xbox Beta', 40),
      title('Unknown Game', 'xbox', null),
    ];
    await db.delete(libraryEntries).where(eq(libraryEntries.userId, USER));
    await db
      .update(users)
      .set({ xboxXuid: XUID, xboxGamertag: 'Tag', xboxSyncedAt: null, recsVersion: 0 })
      .where(eq(users.id, USER));
  });
  afterAll(async () => {
    await db.delete(users).where(eq(users.id, USER));
    await db.delete(games).where(inArray(games.igdbId, IDS));
    await db.$client.end({ timeout: 1 });
  });

  const rows = () => db.select().from(libraryEntries).where(eq(libraryEntries.userId, USER));
  const user = async () => (await db.select().from(users).where(eq(users.id, USER)))[0]!;

  it('imports by cleaned name with platform and status, merges editions, lists unmatched', async () => {
    const res = await syncXboxLibrary(deps(), USER, XUID);
    expect(res).toEqual({
      imported: 2,
      updated: 0,
      unmatched: ['Unknown Game'],
      unmatchedCount: 1,
      total: 4,
    });
    const byId = new Map((await rows()).map((r) => [r.igdbId, r]));
    expect(byId.get(A)).toMatchObject({
      source: 'xbox',
      platform: 'xbox',
      owned: true,
      status: 'playing',
      hoursPlayed: null,
    });
    expect(byId.get(A)!.lastPlayed?.toISOString()).toBe('2026-05-31T00:00:00.000Z');
    expect(byId.get(B)).toMatchObject({ platform: 'pc', status: 'backlog' });
    // Beta: old, with achievement progress, so the user is asked about it. Alpha was recent.
    expect(byId.get(B)!.playedBeforePending).toBe(true);
    expect(byId.get(A)!.playedBeforePending).toBe(false);
    const u = await user();
    expect(u.xboxSyncedAt).toEqual(now);
    expect(u.recsVersion).toBeGreaterThan(0);
  });

  it('a resync never raises the played-before flag on an entry the user already decided on', async () => {
    await syncXboxLibrary(deps(), USER, XUID);
    await db
      .update(libraryEntries)
      .set({ playedBeforePending: false })
      .where(eq(libraryEntries.userId, USER));
    await syncXboxLibrary(deps(), USER, XUID);
    expect((await rows()).some((r) => r.playedBeforePending)).toBe(false);
  });

  it('only gains data on a resync: status and hours of existing entries stay', async () => {
    await syncXboxLibrary(deps(), USER, XUID);
    await db
      .update(libraryEntries)
      .set({ status: 'finished', hoursPlayed: 12 })
      .where(eq(libraryEntries.userId, USER));
    list = [title('Xbox Alpha', 'xbox', new Date('2026-05-31T12:00:00Z'))];
    const res = await syncXboxLibrary(deps(), USER, XUID);
    expect(res).toMatchObject({ imported: 0, updated: 1, total: 1, unmatchedCount: 0 });
    const a = (await rows()).find((r) => r.igdbId === A)!;
    expect(a).toMatchObject({ status: 'finished', hoursPlayed: 12 });
    expect(a.lastPlayed?.toISOString()).toBe('2026-05-31T12:00:00.000Z');
  });

  it('writes nothing when the linked xuid changed during the import', async () => {
    await expect(syncXboxLibrary(deps(), USER, 'someone-else')).rejects.toBeInstanceOf(
      XboxAccountChangedError,
    );
    expect(await rows()).toHaveLength(0);
    expect((await user()).xboxSyncedAt).toBeNull();
  });

  it('claims the Xbox auto-sync slot once and gives it back on release', async () => {
    const first = await claimAutoSync(db, USER, now, 'xboxSyncedAt');
    expect(first.claimed).toBe(true);
    expect((await claimAutoSync(db, USER, now, 'xboxSyncedAt')).claimed).toBe(false);
    // The Steam slot is independent.
    expect((await claimAutoSync(db, USER, now)).claimed).toBe(true);
    await releaseAutoSync(db, USER, first, 'xboxSyncedAt');
    expect((await user()).xboxSyncedAt).toBeNull();
    await db.update(users).set({ steamSyncedAt: null }).where(eq(users.id, USER));
  });
});
