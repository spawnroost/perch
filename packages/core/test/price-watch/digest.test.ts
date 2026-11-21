import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { createDb, games, priceWatches, runMigrations, users, type Db } from '@perch/db';
import {
  DIGEST_MIN_GAP_MS,
  listWatches,
  removeWatch,
  runPriceDigest,
  setWatch,
  WATCH_LIMIT,
  WatchLimitError,
  type CheapSharkClient,
  type PriceInfo,
} from '../../src/index.js';

const url = process.env.DATABASE_URL_TEST;
if (!url) console.warn('[skip] DATABASE_URL_TEST is not set; price watch tests skipped');

const U1 = 'pw-user-1';
const U2 = 'pw-user-2';
const U3 = 'pw-user-3';
const G1 = 987_654_341;
const G2 = 987_654_342;
const T0 = new Date('2026-06-01T10:00:00Z');
const HOUR = 60 * 60 * 1000;

const sale = (price: number): PriceInfo => ({
  currency: 'USD',
  best: {
    store: 'GOG',
    price,
    retailPrice: 20,
    savingsPct: Math.round((1 - price / 20) * 100),
    url: 'https://www.cheapshark.com/redirect?dealID=x',
  },
  historicLow: null,
});
const full: PriceInfo = sale(20);

describe.skipIf(!url)('price watch', () => {
  let db: Db;
  beforeAll(async () => {
    await runMigrations(url!);
    db = createDb(url!);
  });
  afterAll(async () => {
    await db.delete(games).where(inArray(games.igdbId, [G1, G2]));
    await db.delete(users).where(inArray(users.id, [U1, U2, U3]));
    await db?.$client.end({ timeout: 1 });
  });
  beforeEach(async () => {
    await db.delete(games).where(inArray(games.igdbId, [G1, G2]));
    await db.delete(users).where(inArray(users.id, [U1, U2, U3]));
    await db.insert(users).values([
      { id: U1, name: 'A', email: 'pw1@test.local', emailVerified: true },
      { id: U2, name: 'B', email: 'pw2@test.local', emailVerified: false },
      { id: U3, name: 'C', email: 'pw3@steam.perch.invalid', emailVerified: true },
    ]);
    await db.insert(games).values([
      { igdbId: G1, name: 'Watch One', slug: 'pw-one', steamAppId: 111 },
      { igdbId: G2, name: 'Watch Two', slug: 'pw-two' },
    ]);
  });

  describe('watches', () => {
    it('upserts a watch, lists it with its game, and removes it', async () => {
      await setWatch(db, U1, G1, null);
      await setWatch(db, U1, G1, 7.5);
      await setWatch(db, U1, G2, null);
      const rows = await listWatches(db, U1);
      expect(rows).toHaveLength(2);
      expect(rows.find((r) => r.igdbId === G1)).toMatchObject({
        name: 'Watch One',
        targetPrice: 7.5,
        steamAppId: 111,
      });
      await removeWatch(db, U1, G1);
      expect((await listWatches(db, U1)).map((r) => r.igdbId)).toEqual([G2]);
    });

    it('changing the target forgets the announced deal', async () => {
      await setWatch(db, U1, G1, null);
      await db
        .update(priceWatches)
        .set({ lastNotifiedPrice: 5 })
        .where(eq(priceWatches.userId, U1));
      await setWatch(db, U1, G1, 6);
      expect((await listWatches(db, U1))[0]!.lastNotifiedPrice).toBeNull();
    });

    it('caps the number of watches but still lets existing ones change', async () => {
      const extra = Array.from({ length: WATCH_LIMIT }, (_, i) => 987_700_000 + i);
      await db
        .insert(games)
        .values(extra.map((igdbId) => ({ igdbId, name: `W${igdbId}`, slug: `pw-${igdbId}` })));
      try {
        for (const id of extra) await db.insert(priceWatches).values({ userId: U1, igdbId: id });
        await expect(setWatch(db, U1, G1, null)).rejects.toBeInstanceOf(WatchLimitError);
        await expect(setWatch(db, U1, extra[0]!, 9)).resolves.toBeUndefined();
      } finally {
        await db.delete(games).where(inArray(games.igdbId, extra));
      }
    });
  });

  describe('runPriceDigest', () => {
    function setup(priceFor: (name: string) => PriceInfo | null) {
      const mails: { to: string; subject: string; text: string }[] = [];
      const lookups: string[] = [];
      const client: CheapSharkClient = {
        async findPrices(g) {
          lookups.push(g.name);
          return priceFor(g.name);
        },
      };
      let clock = T0;
      const deps = {
        db,
        webOrigin: 'https://perch.test',
        send: async (m: { to: string; subject: string; text: string }) => void mails.push(m),
        now: () => clock,
        // Negative-cache TTL of 0 so every pass sees the client's current answer.
        prices: { client, ttlMs: 0, now: () => clock },
      };
      return {
        mails,
        lookups,
        deps,
        advance: (ms: number) => (clock = new Date(+clock + ms)),
        run: () => runPriceDigest(deps),
      };
    }

    it('sends one digest with every deal, and does not announce the same deal again', async () => {
      await setWatch(db, U1, G1, null);
      await setWatch(db, U1, G2, 12);
      const s = setup((name) => (name === 'Watch One' ? sale(10) : sale(11)));
      expect(await s.run()).toEqual({ checked: 1, sent: 1 });
      expect(s.mails).toHaveLength(1);
      expect(s.mails[0]!.to).toBe('pw1@test.local');
      expect(s.mails[0]!.subject).toBe('2 games on your watchlist are on sale');
      expect(s.mails[0]!.text).toContain('Watch One');
      expect(s.mails[0]!.text).toContain('Watch Two');
      const watches = await listWatches(db, U1);
      expect(watches.map((w) => w.lastNotifiedPrice).sort()).toEqual([10, 11]);
      // A day later the deals are unchanged: nothing to say.
      s.advance(DIGEST_MIN_GAP_MS + HOUR);
      expect(await s.run()).toEqual({ checked: 1, sent: 0 });
      expect(s.mails).toHaveLength(1);
    });

    it('sends at most one digest a day per user, even when run again at once', async () => {
      await setWatch(db, U1, G1, null);
      const s = setup(() => sale(10));
      await s.run();
      await setWatch(db, U1, G2, null);
      expect(await s.run()).toEqual({ checked: 0, sent: 0 });
      expect(s.mails).toHaveLength(1);
      // The next day the new watch is announced.
      s.advance(DIGEST_MIN_GAP_MS + HOUR);
      expect(await s.run()).toEqual({ checked: 1, sent: 1 });
      expect(s.mails[1]!.subject).toBe('Watch Two is on sale');
    });

    it('two passes racing for the same user produce one mail', async () => {
      await setWatch(db, U1, G1, null);
      const s = setup(() => sale(10));
      await Promise.all([s.run(), s.run()]);
      expect(s.mails).toHaveLength(1);
    });

    it('with nothing to announce, gives the slot back so a later sale is caught the same day', async () => {
      await setWatch(db, U1, G1, null);
      let current: PriceInfo = full;
      const s = setup(() => current);
      expect(await s.run()).toEqual({ checked: 1, sent: 0 });
      current = sale(10);
      s.advance(HOUR);
      expect(await s.run()).toEqual({ checked: 1, sent: 1 });
    });

    it('announces a later deal after the first one ended, and a lower price within it', async () => {
      await setWatch(db, U1, G1, null);
      let current: PriceInfo = sale(10);
      const s = setup(() => current);
      await s.run();
      current = full; // the sale ends: memory is cleared
      s.advance(DIGEST_MIN_GAP_MS + HOUR);
      await s.run();
      expect((await listWatches(db, U1))[0]!.lastNotifiedPrice).toBeNull();
      current = sale(10); // the same price returns as a new deal
      s.advance(DIGEST_MIN_GAP_MS + HOUR);
      expect((await s.run()).sent).toBe(1);
      current = sale(8); // cheaper still
      s.advance(DIGEST_MIN_GAP_MS + HOUR);
      expect((await s.run()).sent).toBe(1);
      expect(s.mails).toHaveLength(3);
    });

    it('gives the slot back when the mail fails, so the deal is retried', async () => {
      await setWatch(db, U1, G1, null);
      const s = setup(() => sale(10));
      let fail = true;
      const send = s.deps.send;
      s.deps.send = async (m) => {
        if (fail) throw new Error('resend down');
        await send(m);
      };
      expect(await runPriceDigest(s.deps)).toEqual({ checked: 1, sent: 0 });
      expect((await listWatches(db, U1))[0]!.lastNotifiedPrice).toBeNull();
      fail = false;
      s.advance(HOUR);
      expect(await runPriceDigest(s.deps)).toEqual({ checked: 1, sent: 1 });
    });

    it('skips unverified and placeholder addresses without looking prices up', async () => {
      await setWatch(db, U2, G1, null);
      await setWatch(db, U3, G1, null);
      const s = setup(() => sale(10));
      expect(await s.run()).toEqual({ checked: 0, sent: 0 });
      expect(s.lookups).toEqual([]);
      expect(s.mails).toEqual([]);
    });

    it('skips games that are not sold anywhere', async () => {
      await setWatch(db, U1, G1, null);
      const s = setup(() => null);
      expect(await s.run()).toEqual({ checked: 1, sent: 0 });
      expect(s.mails).toEqual([]);
    });
  });
});
