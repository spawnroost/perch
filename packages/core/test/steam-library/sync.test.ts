import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import {
  createDb,
  games,
  libraryEntries,
  runMigrations,
  steamAppMap,
  users,
  type Db,
} from '@perch/db';
import {
  claimSteamAutoSync,
  createIgdbCache,
  releaseSteamAutoSync,
  resolveSteamAppIds,
  SteamAccountChangedError,
  SteamProfilePrivateError,
  syncSteamLibrary,
  type Game,
  type IgdbCache,
  type IgdbClient,
} from '../../src/index.js';

const url = process.env.DATABASE_URL_TEST;
if (!url) console.warn('[skip] DATABASE_URL_TEST is not set; steam sync tests skipped');

const USER = 'steam-sync-test-user';
const STEAM_ID = '76561198000000777';
// appid -> igdb id; appid 3 is unknown to IGDB.
const IGDB: Record<number, number> = {
  9001: 987655001,
  9002: 987655002,
  9004: 987655004,
  9005: 987655001, // a second appid of the same IGDB game
};
const APPS = [9001, 9002, 9003, 9004, 9005];

const game = (igdbId: number): Game =>
  ({
    igdbId,
    name: `S${igdbId}`,
    slug: `s${igdbId}`,
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
  }) as Game;

describe.skipIf(!url)('syncSteamLibrary', () => {
  let db: Db;
  let cache: IgdbCache;
  let appIdCalls: number[][] = [];
  const ownedList = [
    { appid: 9001, playtimeMinutes: 0, lastPlayed: null as Date | null },
    { appid: 9002, playtimeMinutes: 120, lastPlayed: new Date() as Date | null },
    { appid: 9003, playtimeMinutes: 30, lastPlayed: null as Date | null },
    { appid: 9004, playtimeMinutes: 6000, lastPlayed: new Date('2020-01-01') as Date | null },
  ];
  const owned = async () => ownedList;
  const client: IgdbClient = {
    async searchGames() {
      return { best: null, candidates: [] };
    },
    async getGame(id) {
      return Object.values(IGDB).includes(id) ? game(id) : null;
    },
    async getGames(ids) {
      return ids.filter((i) => Object.values(IGDB).includes(i)).map(game);
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
    async gamesByExactName() {
      return [];
    },
    async keywordNames() {
      return {};
    },
    async steamAppIds(appids) {
      appIdCalls.push([...appids]);
      return new Map(appids.filter((a) => IGDB[a]).map((a) => [a, IGDB[a]!]));
    },
  };
  const deps = () => ({
    db,
    cache,
    client,
    mapVocab: () => ({}),
    fetchOwned: owned,
  });
  const ids = Object.values(IGDB);

  beforeAll(async () => {
    await runMigrations(url!);
    db = createDb(url!);
    cache = createIgdbCache({ db, client, mapVocab: () => ({}), accentFor: async () => null });
    await db
      .insert(users)
      .values({ id: USER, name: 'x', email: 'steam-sync@test.dev' })
      .onConflictDoNothing();
  });
  beforeEach(async () => {
    appIdCalls = [];
    await db.delete(libraryEntries).where(eq(libraryEntries.userId, USER));
    await db.delete(steamAppMap).where(inArray(steamAppMap.appid, APPS));
    await db
      .update(users)
      .set({ steamSyncedAt: null, recsVersion: 0, steamId: STEAM_ID })
      .where(eq(users.id, USER));
  });
  afterAll(async () => {
    await db.delete(users).where(eq(users.id, USER));
    await db.delete(games).where(inArray(games.igdbId, ids));
    await db.delete(steamAppMap).where(inArray(steamAppMap.appid, APPS));
    await db.$client.end({ timeout: 1 });
  });

  const rows = () => db.select().from(libraryEntries).where(eq(libraryEntries.userId, USER));
  const user = async () => (await db.select().from(users).where(eq(users.id, USER)))[0]!;

  it('imports matched games, counts unmatched, stamps the sync and bumps recs_version', async () => {
    const res = await syncSteamLibrary(deps(), USER, STEAM_ID);
    const byId = new Map((await rows()).map((r) => [r.igdbId, r]));
    // Only 9004 (100 h, last played in 2020) was played before; 9001 never, 9002 lately.
    expect(res).toEqual({
      imported: 3,
      updated: 0,
      unmatched: 1,
      total: 4,
      playedBefore: [
        {
          entryId: byId.get(IGDB[9004]!)!.id,
          title: `S${IGDB[9004]}`,
          minutes: 6000,
          lastPlayed: '2020-01-01T00:00:00.000Z',
        },
      ],
    });
    expect(byId.size).toBe(3);
    const a = byId.get(IGDB[9001]!)!;
    expect(a).toMatchObject({ source: 'steam', owned: true, platform: 'pc', status: 'backlog' });
    expect(byId.get(IGDB[9002]!)).toMatchObject({ hoursPlayed: 2, status: 'playing' });
    expect(byId.get(IGDB[9004]!)).toMatchObject({ hoursPlayed: 100, status: 'backlog' });
    const u = await user();
    expect(u.steamSyncedAt).toBeInstanceOf(Date);
    expect(u.recsVersion).toBeGreaterThan(0);
  });

  it('does not ask about entries that already exist', async () => {
    await syncSteamLibrary(deps(), USER, STEAM_ID);
    const again = await syncSteamLibrary(deps(), USER, STEAM_ID);
    expect(again).toMatchObject({ imported: 0, updated: 3, playedBefore: [] });
  });

  it('caches mappings: hits for good, misses for 7 days', async () => {
    await syncSteamLibrary(deps(), USER, STEAM_ID);
    expect(appIdCalls).toHaveLength(1);
    await syncSteamLibrary(deps(), USER, STEAM_ID);
    expect(appIdCalls).toHaveLength(1);
    const later = new Date(Date.now() + 8 * 86_400_000);
    await syncSteamLibrary({ ...deps(), now: () => later }, USER, STEAM_ID);
    expect(appIdCalls).toHaveLength(2);
    expect(appIdCalls[1]).toEqual([9003]);
    const [miss] = await db.select().from(steamAppMap).where(eq(steamAppMap.appid, 9003));
    expect(miss?.igdbId).toBeNull();
  });

  it('never wipes or downgrades existing manual entries', async () => {
    await db
      .insert(games)
      .values({ ...game(IGDB[9002]!), vocab: {} } as never)
      .onConflictDoNothing();
    await db.insert(libraryEntries).values({
      userId: USER,
      igdbId: IGDB[9002]!,
      platform: 'pc',
      hoursPlayed: 50,
      status: 'finished',
      source: 'manual',
      owned: false,
      lastPlayed: new Date('2030-01-01'),
    });
    const res = await syncSteamLibrary(deps(), USER, STEAM_ID);
    expect(res).toMatchObject({ imported: 2, updated: 1 });
    const e = (await rows()).find((r) => r.igdbId === IGDB[9002]!)!;
    expect(e).toMatchObject({ status: 'finished', source: 'manual', hoursPlayed: 50, owned: true });
    expect(e.lastPlayed).toEqual(new Date('2030-01-01'));
  });

  it('counts unmatched owned appids, not collapsed games', async () => {
    const d = {
      ...deps(),
      fetchOwned: async () => [
        { appid: 9001, playtimeMinutes: 60, lastPlayed: null },
        { appid: 9005, playtimeMinutes: 60, lastPlayed: null },
        { appid: 9003, playtimeMinutes: 0, lastPlayed: null },
      ],
    };
    const res = await syncSteamLibrary(d, USER, STEAM_ID);
    expect(res).toMatchObject({ imported: 1, updated: 0, unmatched: 1, total: 3 });
    expect((await rows())[0]?.hoursPlayed).toBe(2);
    // 2 h in total, never recently: one prompt for the merged game, with the summed minutes.
    expect(res.playedBefore).toMatchObject([{ minutes: 120, lastPlayed: null }]);
  });

  it('only raises hours and last played on existing entries, never lowers them', async () => {
    await syncSteamLibrary(deps(), USER, STEAM_ID);
    const high = {
      ...deps(),
      fetchOwned: async () => [
        { appid: 9004, playtimeMinutes: 12000, lastPlayed: new Date('2024-01-01') },
      ],
    };
    await syncSteamLibrary(high, USER, STEAM_ID);
    let e = (await rows()).find((r) => r.igdbId === IGDB[9004]!)!;
    expect(e).toMatchObject({ hoursPlayed: 200, status: 'backlog' });
    expect(e.lastPlayed).toEqual(new Date('2024-01-01'));
    const low = {
      ...deps(),
      fetchOwned: async () => [
        { appid: 9004, playtimeMinutes: 60, lastPlayed: new Date('2019-01-01') },
      ],
    };
    await syncSteamLibrary(low, USER, STEAM_ID);
    e = (await rows()).find((r) => r.igdbId === IGDB[9004]!)!;
    expect(e.hoursPlayed).toBe(200);
    expect(e.lastPlayed).toEqual(new Date('2024-01-01'));
  });

  it('aborts without writing when the linked Steam id changed during the import', async () => {
    const d = {
      ...deps(),
      fetchOwned: async () => {
        await db.update(users).set({ steamId: null }).where(eq(users.id, USER));
        return ownedList;
      },
    };
    await expect(syncSteamLibrary(d, USER, STEAM_ID)).rejects.toBeInstanceOf(
      SteamAccountChangedError,
    );
    expect(await rows()).toHaveLength(0);
    expect((await user()).steamSyncedAt).toBeNull();
  });

  it('keeps mappings from batches that completed before a later batch failed', async () => {
    const base = 880_000;
    const appids = Array.from({ length: 501 }, (_, i) => base + i);
    await db.delete(steamAppMap).where(inArray(steamAppMap.appid, appids));
    let calls = 0;
    const flaky = {
      async steamAppIds(batch: readonly number[]) {
        if (++calls === 2) throw new Error('igdb down');
        return new Map(batch.map((a) => [a, 1_000_000 + a]));
      },
    };
    await expect(resolveSteamAppIds({ db, client: flaky }, appids)).rejects.toThrow('igdb down');
    const saved = await db.select().from(steamAppMap).where(inArray(steamAppMap.appid, appids));
    expect(saved).toHaveLength(500);
    await db.delete(steamAppMap).where(inArray(steamAppMap.appid, appids));
  });

  it('claims an auto-sync once: concurrent claims have one winner, fresh syncs are not claimed', async () => {
    const now = new Date();
    const results = await Promise.all([
      claimSteamAutoSync(db, USER, now),
      claimSteamAutoSync(db, USER, now),
      claimSteamAutoSync(db, USER, now),
    ]);
    expect(results.filter((r) => r.claimed)).toHaveLength(1);
    expect((await user()).steamSyncedAt).toEqual(now);
    expect(
      (await claimSteamAutoSync(db, USER, new Date(now.getTime() + 5 * 3_600_000))).claimed,
    ).toBe(false);
    expect(
      (await claimSteamAutoSync(db, USER, new Date(now.getTime() + 6 * 3_600_000))).claimed,
    ).toBe(true);
  });

  it('releases a claim back to the previous value, but only its own', async () => {
    const earlier = new Date('2026-01-01T00:00:00Z');
    await db.update(users).set({ steamSyncedAt: earlier }).where(eq(users.id, USER));
    const now = new Date();
    const claim = await claimSteamAutoSync(db, USER, now);
    expect(claim.claimed).toBe(true);
    await releaseSteamAutoSync(db, USER, claim);
    expect((await user()).steamSyncedAt).toEqual(earlier);
    // A newer sync stamped meanwhile is not rolled back.
    const claim2 = await claimSteamAutoSync(db, USER, now);
    const stamped = new Date(now.getTime() + 1000);
    await db.update(users).set({ steamSyncedAt: stamped }).where(eq(users.id, USER));
    await releaseSteamAutoSync(db, USER, claim2);
    expect((await user()).steamSyncedAt).toEqual(stamped);
  });

  it('propagates a private profile and writes nothing', async () => {
    const d = {
      ...deps(),
      fetchOwned: async () => {
        throw new SteamProfilePrivateError();
      },
    };
    await expect(syncSteamLibrary(d, USER, STEAM_ID)).rejects.toBeInstanceOf(
      SteamProfilePrivateError,
    );
    expect(await rows()).toHaveLength(0);
    expect((await user()).steamSyncedAt).toBeNull();
  });
});
