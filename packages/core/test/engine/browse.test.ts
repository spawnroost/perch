import { describe, expect, it, vi } from 'vitest';
import { IGDB_PLATFORM as P } from '../../src/devices/presets.js';
import { browse, BROWSE_POOL } from '../../src/engine/browse.js';
import { createNoneProvider } from '../../src/engine/explain.js';
import type { FilterDevice } from '../../src/engine/filters.js';
import type { EngineGame, FeedbackItem, LibraryItem, RawGame } from '../../src/engine/types.js';

const NOW = new Date('2026-06-01T00:00:00Z');
const toRaw = ({ vocab: _v, ...rest }: EngineGame): RawGame => rest;

const mk = (id: number, rating: number, extra: Partial<EngineGame> = {}): EngineGame => ({
  igdbId: id,
  name: `G${id}`,
  firstRelease: new Date('2020-01-01T00:00:00Z'),
  genres: [12],
  themes: [17],
  similarIds: [],
  series: [],
  rating,
  ratingCount: 1000,
  vocab: { rpg: 1 },
  platforms: [P.windows, P.ps5],
  steamAppId: null,
  ...extra,
});

const lib = (g: EngineGame, owned = true, hours: number | null = 50): LibraryItem => ({
  game: g,
  hours,
  lastPlayed: new Date('2026-05-30T00:00:00Z'),
  status: 'playing',
  owned,
});

function setup(pool: EngineGame[], more: Record<string, unknown> = {}) {
  const queryByTags = vi.fn(async () => pool.map(toRaw));
  const deps = {
    getGames: async () => [],
    queryByTags,
    mapVocab: (g: { igdbId: number }) => pool.find((c) => c.igdbId === g.igdbId)?.vocab ?? {},
    explain: createNoneProvider({ labels: {} }),
    now: () => NOW,
    ...more,
  };
  const run = (
    o: {
      library?: LibraryItem[];
      feedback?: FeedbackItem[];
      genres?: number[];
      themes?: number[];
      limit?: number;
      offset?: number;
      devices?: FilterDevice[];
    } = {},
  ) =>
    browse(deps, {
      library: o.library ?? [],
      feedback: o.feedback ?? [],
      genres: o.genres ?? [12],
      themes: o.themes ?? [],
      limit: o.limit ?? 10,
      offset: o.offset ?? 0,
      devices: o.devices,
    });
  return { run, queryByTags };
}

describe('browse', () => {
  it('asks IGDB for games matching a genre and a theme, one pool', async () => {
    const { run, queryByTags } = setup([mk(10, 80)]);
    await run({ genres: [12, 31], themes: [17] });
    expect(queryByTags).toHaveBeenCalledTimes(1);
    expect(queryByTags).toHaveBeenCalledWith({
      genres: [12, 31],
      themes: [17],
      match: 'all',
      minRatingCount: expect.any(Number),
      limit: BROWSE_POOL,
    });
  });

  it('keeps only games with a selected genre AND a selected theme', async () => {
    const pool = [
      mk(10, 90, { genres: [12], themes: [17] }),
      mk(11, 89, { genres: [12], themes: [99] }),
      mk(12, 88, { genres: [99], themes: [17] }),
    ];
    const { items } = await setup(pool).run({ genres: [12], themes: [17] });
    expect(items.map((r) => r.game.igdbId)).toEqual([10]);
  });

  it('excludes owned, disliked and played games but keeps thumbs-up ones', async () => {
    const pool = [mk(10, 90), mk(11, 89), mk(12, 88), mk(13, 87), mk(14, 86)];
    const { items } = await setup(pool).run({
      library: [lib(pool[0]!, true, 0)], // owned backlog: still owned
      feedback: [
        { igdbId: 11, kind: 'down' },
        { igdbId: 12, kind: 'not_interested' },
        { igdbId: 13, kind: 'up' },
      ],
    });
    expect(items.map((r) => r.game.igdbId)).toEqual([13, 14]);
  });

  it('skips unreleased games', async () => {
    const pool = [mk(10, 90, { firstRelease: new Date('2027-01-01T00:00:00Z') }), mk(11, 80)];
    const { items } = await setup(pool).run();
    expect(items.map((r) => r.game.igdbId)).toEqual([11]);
  });

  it('ranks by taste score: games like the library first', async () => {
    const pool = [mk(10, 95, { vocab: { puzzle: 1 } }), mk(11, 70, { vocab: { rpg: 1 } })];
    const lg = mk(1, 90, { vocab: { rpg: 1 } });
    const { items } = await setup(pool).run({ library: [lib(lg)] });
    expect(items.map((r) => r.game.igdbId)).toEqual([11, 10]);
    expect(items[0]!.sourceGame?.igdbId).toBe(1);
    expect(items[0]!.score).toBeGreaterThan(items[1]!.score);
  });

  it('pages with offset and reports hasMore; ranks continue across pages', async () => {
    const pool = Array.from({ length: 5 }, (_, i) => mk(10 + i, 90 - i));
    const { run } = setup(pool);
    const p1 = await run({ limit: 2 });
    expect(p1.items.map((r) => [r.rank, r.game.igdbId])).toEqual([
      [1, 10],
      [2, 11],
    ]);
    expect(p1.hasMore).toBe(true);
    const p3 = await run({ limit: 2, offset: 4 });
    expect(p3.items.map((r) => [r.rank, r.game.igdbId])).toEqual([[5, 14]]);
    expect(p3.hasMore).toBe(false);
  });

  it('filters by device, sets fit, and pages over the kept games', async () => {
    const pool = [
      mk(10, 90, { platforms: [P.ps5] }), // not on the PC
      mk(11, 89),
      mk(12, 88),
      mk(13, 87),
    ];
    const pc: FilterDevice = {
      id: 'pc1',
      kind: 'pc',
      platformIds: [P.windows],
      gpuScore: 5000,
      cpuScore: 5000,
      ramGb: 16,
    };
    const { run } = setup(pool, { fetchRequirements: async () => null });
    const p1 = await run({ devices: [pc], limit: 2 });
    expect(p1.items.map((r) => r.game.igdbId)).toEqual([11, 12]);
    expect(p1.items[0]!.fit?.deviceId).toBe('pc1');
    expect(p1.hasMore).toBe(true);
    const p2 = await run({ devices: [pc], limit: 2, offset: 2 });
    expect(p2.items.map((r) => r.game.igdbId)).toEqual([13]);
    expect(p2.hasMore).toBe(false);
  });

  it('returns nothing when no game matches', async () => {
    const res = await setup([]).run();
    expect(res).toEqual({ items: [], hasMore: false });
  });
});
