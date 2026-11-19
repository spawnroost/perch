import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { createDb, games, libraryEntries, runMigrations, users, type Db } from '@perch/db';
import {
  createIgdbCache,
  importExportGames,
  type ExportGame,
  type Game,
  type IgdbCache,
  type IgdbClient,
} from '../../src/index.js';

const url = process.env.DATABASE_URL_TEST;
if (!url) console.warn('[skip] DATABASE_URL_TEST is not set; export import tests skipped');

const USER = 'export-import-test-user';
const G_GOG = 987658001;
const G_EPIC = 987658002;
const G_PC = 987658003;
const ALL = [G_GOG, G_EPIC, G_PC];
const NOW = new Date('2026-11-19T12:00:00Z');

const game = (igdbId: number): Game =>
  ({
    igdbId,
    name: `Export ${igdbId}`,
    slug: `export-${igdbId}`,
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

describe.skipIf(!url)('importExportGames', () => {
  let db: Db;
  let cache: IgdbCache;
  const client: IgdbClient = {
    async searchGames() {
      return { best: null, candidates: [] };
    },
    async getGame(id) {
      return ALL.includes(id) ? game(id) : null;
    },
    async getGames(ids) {
      return ids.filter((i) => ALL.includes(i)).map(game);
    },
    async queryByTags() {
      return [];
    },
    async getTimeToBeat() {
      return null;
    },
    async keywordNames() {
      return {};
    },
    async steamAppIds() {
      return new Map();
    },
    async externalGameIds(_s, uids) {
      return new Map(uids.filter((u) => u === '555').map((u) => [u, G_GOG]));
    },
    async gamesByExactName(names) {
      const rows = [
        { igdbId: G_EPIC, name: 'Epic Title', gameType: 0, firstRelease: null },
        { igdbId: G_PC, name: 'Sheet Title', gameType: 0, firstRelease: null },
      ];
      return rows.filter((r) => names.includes(r.name));
    },
  };
  const deps = () => ({ db, cache, client, now: () => NOW });
  const list: ExportGame[] = [
    {
      source: 'gog',
      storeId: '555',
      title: 'Whatever',
      minutesPlayed: 90,
      lastPlayed: '2026-11-10T00:00:00Z',
    },
    {
      source: 'epic',
      storeId: 'x',
      title: 'Epic Title',
      minutesPlayed: 6000,
      lastPlayed: '2025-01-01T00:00:00Z',
    },
    { source: 'other', title: 'Sheet Title' },
    { source: 'epic', title: 'Not In IGDB' },
  ];

  beforeAll(async () => {
    await runMigrations(url!);
    db = createDb(url!);
    cache = createIgdbCache({ db, client, mapVocab: () => ({}), accentFor: async () => null });
    await db
      .insert(users)
      .values({ id: USER, name: 'x', email: 'export-import@test.dev' })
      .onConflictDoNothing();
  });
  beforeEach(async () => {
    await db.delete(libraryEntries).where(eq(libraryEntries.userId, USER));
    await db.update(users).set({ recsVersion: 0 }).where(eq(users.id, USER));
  });
  afterAll(async () => {
    await db.delete(users).where(eq(users.id, USER));
    await db.delete(games).where(inArray(games.igdbId, ALL));
    await db.$client.end({ timeout: 1 });
  });

  const rows = () => db.select().from(libraryEntries).where(eq(libraryEntries.userId, USER));

  it('imports with store platforms, hours and the 30-day status rule; lists unmatched', async () => {
    const res = await importExportGames(deps(), USER, list);
    expect(res).toEqual({
      imported: 3,
      updated: 0,
      unmatched: ['Not In IGDB'],
      unmatchedCount: 1,
      total: 4,
    });
    const byId = new Map((await rows()).map((r) => [r.igdbId, r]));
    expect(byId.get(G_GOG)).toMatchObject({
      platform: 'gog',
      source: 'import',
      owned: true,
      hoursPlayed: 1.5,
      status: 'playing',
    });
    expect(byId.get(G_EPIC)).toMatchObject({
      platform: 'epic',
      hoursPlayed: 100,
      status: 'backlog',
    });
    expect(byId.get(G_PC)).toMatchObject({ platform: 'pc', status: 'backlog', hoursPlayed: null });
    // Only the Epic title (100 h, last played in 2025) was played before.
    expect([...byId.values()].filter((r) => r.playedBeforePending).map((r) => r.igdbId)).toEqual([
      G_EPIC,
    ]);
    const [u] = await db.select().from(users).where(eq(users.id, USER));
    expect(u!.recsVersion).toBeGreaterThan(0);
  });

  it('is idempotent and never downgrades existing entries', async () => {
    await importExportGames(deps(), USER, list);
    await db
      .update(libraryEntries)
      .set({ status: 'finished', hoursPlayed: 500 })
      .where(eq(libraryEntries.igdbId, G_EPIC));
    const res = await importExportGames(deps(), USER, list);
    expect(res).toMatchObject({ imported: 0, updated: 3 });
    const e = (await rows()).find((r) => r.igdbId === G_EPIC)!;
    expect(e).toMatchObject({ status: 'finished', hoursPlayed: 500 });
  });

  it('adds up playtime of titles that resolve to one game on one store', async () => {
    await importExportGames(deps(), USER, [
      { source: 'epic', title: 'Epic Title', minutesPlayed: 60 },
      { source: 'epic', storeId: 'y', title: 'Epic Title', minutesPlayed: 120 },
    ]);
    const r = await rows();
    expect(r).toHaveLength(1);
    expect(r[0]!.hoursPlayed).toBe(3);
  });

  it('does nothing for an empty list', async () => {
    const res = await importExportGames(deps(), USER, []);
    expect(res).toEqual({ imported: 0, updated: 0, unmatched: [], unmatchedCount: 0, total: 0 });
    expect(await rows()).toEqual([]);
  });
});
