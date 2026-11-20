import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createDb, gameReasons, llmUsage, runMigrations, users, type Db } from '@perch/db';
import {
  bumpRecsVersion,
  createReasonService,
  reserveLlmBatch,
  saveReasons,
  USER_DAILY_BATCH_CAP,
  type ReasonExplainer,
  type ReasonItem,
  type RecommendationsResponse,
} from '../../src/index.js';

type Rec = RecommendationsResponse['recommendations'][number];
const url = process.env.DATABASE_URL_TEST;
const U1 = 'reason-svc-u1';
const U2 = 'reason-svc-u2';

const rec = (id: number, reason = 'template'): Rec =>
  ({
    rank: id,
    reason,
    sourceGame: { igdbId: 900, name: 'Src' },
    game: { igdbId: id, name: `G${id}` },
  }) as unknown as Rec;
const recs = (n: number) => Array.from({ length: n }, (_, i) => rec(i + 1));

function explainer(impl?: (items: ReasonItem[]) => Promise<Map<number, string>>) {
  const explain = vi.fn(
    impl ??
      (async (items: ReasonItem[]) => new Map(items.map((i) => [i.igdbId, `ai ${i.igdbId}`]))),
  );
  return { name: 'fake', explain } as ReasonExplainer & { explain: typeof explain };
}

describe.skipIf(!url)('reason service + usage caps', () => {
  let db: Db;
  beforeAll(async () => {
    await runMigrations(url!);
    db = createDb(url!);
    for (const id of [U1, U2]) {
      await db.delete(users).where(eq(users.id, id));
      await db.insert(users).values({ id, name: 'T', email: `${id}@test.local` });
    }
  });
  afterAll(async () => {
    for (const id of [U1, U2]) await db?.delete(users).where(eq(users.id, id));
    await db?.$client.end({ timeout: 1 });
  });
  beforeEach(async () => {
    await db.delete(gameReasons).where(eq(gameReasons.userId, U1));
    await db.delete(gameReasons).where(eq(gameReasons.userId, U2));
    await db.delete(llmUsage);
  });

  describe('reserveLlmBatch', () => {
    const now = new Date('2026-11-20T10:00:00Z');
    it('allows the per-user cap, then refuses, and resets the next day', async () => {
      for (let i = 0; i < USER_DAILY_BATCH_CAP; i++)
        expect(await reserveLlmBatch(db, U1, { globalCap: 1000, now })).toBe(true);
      expect(await reserveLlmBatch(db, U1, { globalCap: 1000, now })).toBe(false);
      expect(await reserveLlmBatch(db, U2, { globalCap: 1000, now })).toBe(true);
      expect(
        await reserveLlmBatch(db, U1, { globalCap: 1000, now: new Date('2026-11-21T00:01:00Z') }),
      ).toBe(true);
    });
    it('drops usage rows from earlier days', async () => {
      await db.insert(llmUsage).values({ key: 'global', day: '2026-11-01', count: 9 });
      await reserveLlmBatch(db, U1, { globalCap: 1000, now });
      const days = (await db.select().from(llmUsage)).map((r) => r.day);
      expect(days.every((d) => d === '2026-11-20')).toBe(true);
    });
    it('enforces the global cap without spending the user slot', async () => {
      expect(await reserveLlmBatch(db, U1, { globalCap: 1, now })).toBe(true);
      expect(await reserveLlmBatch(db, U2, { globalCap: 1, now })).toBe(false);
      // A scope keeps its own counters: the unscoped ones are not touched.
      expect(await reserveLlmBatch(db, U2, { globalCap: 1, now, scope: 'voice' })).toBe(true);
      expect(await reserveLlmBatch(db, U1, { globalCap: 1, now, scope: 'voice' })).toBe(false);
      const rows = await db
        .select()
        .from(llmUsage)
        .where(eq(llmUsage.key, `user:${U2}`));
      expect(rows.every((r) => r.count === 0)).toBe(true);
    });
  });

  const svc = (e: ReasonExplainer | null, extra = {}) =>
    createReasonService({
      db,
      explainer: e,
      globalDailyCap: 1000,
      waitMs: 500,
      log: () => {},
      ...extra,
    });

  it('does nothing without an explainer', async () => {
    const out = await svc(null).overlay(U1, recs(3));
    expect(out.pending).toBe(false);
    expect(out.recommendations.map((r) => r.reason)).toEqual(['template', 'template', 'template']);
  });

  it('generates for the top 20 only, overlays, stores, and reuses the cache', async () => {
    const e = explainer();
    const s = svc(e);
    const out = await s.overlay(U1, recs(25));
    expect(e.explain).toHaveBeenCalledTimes(1);
    expect(e.explain.mock.calls[0]![0]).toHaveLength(20);
    expect(out.pending).toBe(false);
    expect(out.recommendations[0]!.reason).toBe('ai 1');
    expect(out.recommendations[24]!.reason).toBe('template');
    const again = await s.overlay(U1, recs(25));
    expect(e.explain).toHaveBeenCalledTimes(1);
    expect(again.recommendations[19]!.reason).toBe('ai 20');
  });

  it('ignores stored reasons from an older recs version', async () => {
    const e = explainer();
    const s = svc(e);
    await s.overlay(U1, recs(2));
    await bumpRecsVersion(db, U1);
    const out = await s.overlay(U1, recs(2));
    expect(e.explain).toHaveBeenCalledTimes(2);
    expect(out.recommendations[0]!.reason).toBe('ai 1');
  });

  it('only asks for the missing picks', async () => {
    const e = explainer();
    const s = svc(e);
    await s.overlay(U1, recs(2));
    await s.overlay(U1, recs(4));
    expect(e.explain.mock.calls[1]![0].map((i: { igdbId: number }) => i.igdbId)).toEqual([3, 4]);
  });

  it('answers pending when the batch is slow, finishes in the background, shares one call', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const e = explainer(async (items) => {
      await gate;
      return new Map(items.map((i) => [i.igdbId, 'late']));
    });
    const s = svc(e, { waitMs: 20 });
    const [a, b] = await Promise.all([s.overlay(U1, recs(2)), s.overlay(U1, recs(2))]);
    expect(a.pending).toBe(true);
    expect(b.pending).toBe(true);
    expect(a.recommendations[0]!.reason).toBe('template');
    expect(e.explain).toHaveBeenCalledTimes(1);
    release();
    await vi.waitFor(async () => {
      const out = await s.overlay(U1, recs(2));
      expect(out.pending).toBe(false);
      expect(out.recommendations[0]!.reason).toBe('late');
    });
    expect(e.explain).toHaveBeenCalledTimes(1);
  });

  it('a request with other picks joins the batch, answers pending at once, and is served next', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let first = true;
    const e = explainer(async (items) => {
      if (first) {
        first = false;
        await gate;
      }
      return new Map(items.map((i) => [i.igdbId, `ai ${i.igdbId}`]));
    });
    const s = svc(e, { waitMs: 5000 });
    const a = s.overlay(U1, recs(2));
    await vi.waitFor(() => expect(e.explain).toHaveBeenCalledTimes(1));
    const t0 = Date.now();
    const b = await s.overlay(U1, [rec(7), rec(8)]);
    expect(Date.now() - t0).toBeLessThan(1000);
    expect(b.pending).toBe(true);
    expect(b.recommendations[0]!.reason).toBe('template');
    release();
    expect((await a).pending).toBe(false);
    const c = await s.overlay(U1, [rec(7), rec(8)]);
    expect(c.pending).toBe(false);
    expect(c.recommendations.map((r) => r.reason)).toEqual(['ai 7', 'ai 8']);
    expect(e.explain).toHaveBeenCalledTimes(2);
  });

  it('keeps template reasons on failure, logs once, and does not retry for 10 minutes', async () => {
    const e = explainer(async () => {
      throw new Error('boom');
    });
    let t = 1_000_000;
    const log = vi.fn();
    const s = svc(e, { log, now: () => new Date(t) });
    const out = await s.overlay(U1, recs(2));
    expect(out.pending).toBe(false);
    expect(out.recommendations[0]!.reason).toBe('template');
    await s.overlay(U1, recs(2));
    expect(e.explain).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledTimes(1);
    t += 10 * 60_000 + 1;
    await s.overlay(U1, recs(2));
    expect(e.explain).toHaveBeenCalledTimes(2);
  });

  it('does not loop on picks the model skipped', async () => {
    const e = explainer(async (items) => new Map([[items[0]!.igdbId, 'only one']]));
    const s = svc(e);
    const out = await s.overlay(U1, recs(3));
    expect(out.pending).toBe(false);
    await s.overlay(U1, recs(3));
    expect(e.explain).toHaveBeenCalledTimes(1);
  });

  it('skips generation once the cap is spent, and stops asking the usage table', async () => {
    const e = explainer();
    const s = svc(e, { globalDailyCap: 0 });
    const tx = vi.spyOn(db, 'transaction');
    const out = await s.overlay(U1, recs(2));
    expect(e.explain).not.toHaveBeenCalled();
    expect(out.pending).toBe(false);
    await s.overlay(U1, recs(2));
    expect(tx).toHaveBeenCalledTimes(1);
    tx.mockRestore();
  });

  it('never replaces a reason with one from an older recs version', async () => {
    await saveReasons(db, U1, 5, new Map([[1, 'new']]));
    await saveReasons(db, U1, 4, new Map([[1, 'stale']]));
    const [row] = await db.select().from(gameReasons).where(eq(gameReasons.userId, U1));
    expect(row).toMatchObject({ text: 'new', recsVersion: 5 });
    await saveReasons(db, U1, 6, new Map([[1, 'newer']]));
    const [row2] = await db.select().from(gameReasons).where(eq(gameReasons.userId, U1));
    expect(row2).toMatchObject({ text: 'newer', recsVersion: 6 });
  });
});
