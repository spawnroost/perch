import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { createDb, deckCompat, devices, games, runMigrations, users, type Db } from '@perch/db';
import { browseForUser, type UserEngineDeps } from '../../src/engine/for-user.js';
import { createTtlMemo } from '../../src/browse/ttl-memo.js';
import type { BrowseList } from '../../src/engine/browse.js';
import type { SteamClient } from '../../src/requirements/steam.js';

const url = process.env.DATABASE_URL_TEST;
if (!url) console.warn('[skip] DATABASE_URL_TEST is not set; browse-for-user tests skipped');

const USER = 'browse-fast-test-user';
const IDS = [987660001, 987660002, 987660003, 987660004];
const APPS = [987660101, 987660102, 987660103, 987660104];
const DECK_DELAY_MS = 1500;

describe.skipIf(!url)('browseForUser (cached fits only)', () => {
  let db: Db;
  let deckCalls = 0;
  const steam: SteamClient = {
    async getPcRequirements() {
      return {};
    },
    async getDeckCompat(appId: number) {
      deckCalls++;
      await new Promise((r) => setTimeout(r, DECK_DELAY_MS));
      // The first game turns out unplayable on a Deck.
      return appId === APPS[0] ? 'unsupported' : 'verified';
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
    await db.insert(users).values({ id: USER, name: 'T', email: 'browse-fast@test.local' });
    await db.insert(games).values(
      IDS.map((igdbId, i) => ({
        igdbId,
        name: `Browse ${i}`,
        slug: `browse-fast-${i}`,
        genres: [5],
        themes: [],
        platforms: [6],
        steamAppId: APPS[i]!,
        // Higher rating first so the ranking order is IDS order.
        rating: 90 - i,
        ratingCount: 1000,
        vocab: {},
      })),
    );
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
      browseLists: createTtlMemo<BrowseList>({ max: 5 }),
      cache: {
        getGames,
        queryByTags: async () => getGames(IDS),
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

  it('answers without waiting on Steam, shows unknown fits, warms them in the background', async () => {
    const t0 = Date.now();
    const cold = await browseForUser(deps, USER, {
      genres: [5],
      themes: [],
      limit: 2,
      offset: 0,
    });
    expect(Date.now() - t0).toBeLessThan(DECK_DELAY_MS);
    expect(cold.picks).toHaveLength(2);
    expect(cold.hasMore).toBe(true);
    expect(cold.picks.every((p) => p.fits[0]?.status === 'unknown')).toBe(true);

    // The background warm fills the cache for the page that was served (2 games).
    await expect
      .poll(
        async () =>
          (await db.select().from(deckCompat).where(inArray(deckCompat.steamAppId, APPS))).length,
        { timeout: 10_000, interval: 200 },
      )
      .toBe(2);
    expect(deckCalls).toBe(2);
  });

  it('pages stay stable when fits fill in between requests (no duplicates, no skips)', async () => {
    // Game 0 is now cached as unsupported, but page 1 already served it: the memoized list is
    // append-only, so page 2 continues from where page 1 stopped.
    const p2 = await browseForUser(deps, USER, { genres: [5], themes: [], limit: 2, offset: 2 });
    expect(p2.picks.map((p) => p.game.igdbId)).toEqual([IDS[2], IDS[3]]);
    expect(p2.hasMore).toBe(false);
  });

  it('a fresh list hides games whose cached fit says no', async () => {
    const fresh = await browseForUser(
      { ...deps, browseLists: createTtlMemo<BrowseList>({ max: 5 }) },
      USER,
      { genres: [5], themes: [], limit: 10, offset: 0 },
    );
    expect(fresh.picks.map((p) => p.game.igdbId)).not.toContain(IDS[0]);
    expect(fresh.picks).toHaveLength(3);
  });
});
