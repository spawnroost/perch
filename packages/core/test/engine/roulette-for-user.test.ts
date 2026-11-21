import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import {
  createDb,
  deckCompat,
  devices,
  games,
  libraryEntries,
  runMigrations,
  users,
  type Db,
} from '@perch/db';
import { rouletteForUser, type UserEngineDeps } from '../../src/engine/for-user.js';
import type { SteamClient } from '../../src/requirements/steam.js';

const url = process.env.DATABASE_URL_TEST;
if (!url) console.warn('[skip] DATABASE_URL_TEST is not set; roulette-for-user tests skipped');

const USER = 'roulette-fast-test-user';
const IDS = [987650001, 987650002, 987650003];
const APPS = [987650101, 987650102, 987650103];
const DECK_DELAY_MS = 1500;

describe.skipIf(!url)('rouletteForUser (cached fits only)', () => {
  let db: Db;
  let deckCalls = 0;
  const steam: SteamClient = {
    async getPcRequirements() {
      return {};
    },
    async getDeckCompat() {
      deckCalls++;
      await new Promise((r) => setTimeout(r, DECK_DELAY_MS));
      return 'verified';
    },
    async getReviewSummary() {
      return null;
    },
    async getReviewTexts() {
      return [];
    },
  };
  let deps: UserEngineDeps;

  beforeAll(async () => {
    await runMigrations(url!);
    db = createDb(url!);
    await db.delete(users).where(eq(users.id, USER));
    await db.delete(games).where(inArray(games.igdbId, IDS));
    await db.delete(deckCompat).where(inArray(deckCompat.steamAppId, APPS));
    await db.insert(users).values({ id: USER, name: 'T', email: 'roulette-fast@test.local' });
    await db.insert(games).values(
      IDS.map((igdbId, i) => ({
        igdbId,
        name: `Fast ${i}`,
        slug: `fast-${i}`,
        genres: [12],
        platforms: [6],
        steamAppId: APPS[i]!,
        vocab: {},
      })),
    );
    await db
      .insert(libraryEntries)
      .values(IDS.map((igdbId) => ({ userId: USER, igdbId, platform: 'pc', status: 'backlog' })));
    await db.insert(devices).values({
      userId: USER,
      kind: 'steam-deck',
      name: 'Deck',
      platformIds: [6],
      isDefault: true,
    });
    const getGames = async (ids: readonly number[]) =>
      (await db
        .select()
        .from(games)
        .where(inArray(games.igdbId, [...ids]))) as never;
    deps = {
      db,
      steam,
      mapVocab: () => ({}),
      labels: {},
      cache: {
        getGames,
        queryByTags: async () => [],
        warmTimeToBeat: async () => {},
      },
    } as unknown as UserEngineDeps;
  });
  afterAll(async () => {
    await db?.delete(users).where(eq(users.id, USER));
    await db?.delete(games).where(inArray(games.igdbId, IDS));
    await db?.delete(deckCompat).where(inArray(deckCompat.steamAppId, APPS));
    await db?.$client.end({ timeout: 1 });
  });

  it('answers without waiting on Steam when fits are not cached, then warms them in the background', async () => {
    const t0 = Date.now();
    const cold = await rouletteForUser(deps, USER, { device: 'all' });
    expect(Date.now() - t0).toBeLessThan(DECK_DELAY_MS);
    expect(cold?.pick.fits[0]?.status).toBe('unknown');

    // The background warm fills the cache; a later spin sees the fit.
    await expect
      .poll(
        async () =>
          (await db.select().from(deckCompat).where(inArray(deckCompat.steamAppId, APPS))).length,
        {
          timeout: 10_000,
          interval: 200,
        },
      )
      .toBe(IDS.length);
    expect(deckCalls).toBe(IDS.length);
    const warm = await rouletteForUser(deps, USER, { device: 'all' });
    expect(warm?.pick.fits[0]?.status).toBe('green');
    expect(deckCalls).toBe(IDS.length);
  });
});
