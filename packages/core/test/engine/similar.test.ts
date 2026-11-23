import { describe, expect, it, vi } from 'vitest';
import { IGDB_PLATFORM as P } from '../../src/devices/presets.js';
import { createNoneProvider, likeReason } from '../../src/engine/explain.js';
import type { FilterDevice } from '../../src/engine/filters.js';
import { MAX_PER_SERIES } from '../../src/engine/rank.js';
import { SIMILAR_LIMIT, similarTo } from '../../src/engine/similar.js';
import type { EngineGame, RawGame } from '../../src/engine/types.js';
import { NOW, game, item } from './fixtures.js';

const toRaw = ({ vocab: _v, ...rest }: EngineGame): RawGame => rest;
const labels = { roguelike: 'Roguelike', mythology: 'Mythology', action: 'Action' };

const seed = game(
  1,
  'Hades',
  { roguelike: 1, mythology: 0.9, action: 0.8 },
  { genres: [25], similarIds: [10, 11] },
);
const close = game(10, 'Close', { roguelike: 1, mythology: 0.8, action: 0.7 }, { genres: [25] });
const mid = game(11, 'Mid', { roguelike: 1, action: 0.3, racing: 1 }, { genres: [10] });
const far = game(12, 'Far', { racing: 1, sport: 0.5 }, { genres: [14] });
const inLib = game(13, 'Owned', { roguelike: 1, mythology: 1, action: 1 });
const notInt = game(14, 'Nope', { roguelike: 1, mythology: 1, action: 1 });
const future = game(
  15,
  'Future',
  { roguelike: 1, mythology: 1, action: 1 },
  { firstRelease: new Date('2030-01-01T00:00:00Z') },
);

const pool = [seed, close, mid, far, inLib, notInt, future];
const mkDeps = (games: EngineGame[] = pool, more: Record<string, unknown> = {}) => ({
  getGames: async (ids: readonly number[]) =>
    games.filter((g) => ids.includes(g.igdbId)).map(toRaw),
  queryByTags: async () => games.map(toRaw),
  mapVocab: (g: { igdbId: number }) => games.find((c) => c.igdbId === g.igdbId)?.vocab ?? {},
  explain: createNoneProvider({ labels }),
  now: () => NOW,
  ...more,
});
const base = { game: seed, library: [], feedback: [], labels };

describe('similarTo', () => {
  it('ranks by idf cosine to the one game and drops the game itself', async () => {
    const recs = await similarTo(mkDeps(), { ...base, limit: 10 });
    const ids = recs.map((r) => r.game.igdbId);
    expect(ids).not.toContain(1);
    expect(ids.indexOf(10)).toBeLessThan(ids.indexOf(11));
    expect(recs.map((r) => r.rank)).toEqual(recs.map((_, i) => i + 1));
    expect(recs[0]!.sourceGame).toEqual({ igdbId: 1, name: 'Hades' });
  });

  it('drops games with nothing in common with it', async () => {
    const ids = (await similarTo(mkDeps(), { ...base, limit: 10 })).map((r) => r.game.igdbId);
    expect(ids).not.toContain(12);
  });

  it('excludes the library (backlog too), not-interested, played and unreleased games', async () => {
    const recs = await similarTo(mkDeps(), {
      ...base,
      library: [item(inLib, 0, null, 'backlog', true)],
      feedback: [{ igdbId: 14, kind: 'not_interested' }],
      limit: 10,
    });
    const ids = recs.map((r) => r.game.igdbId);
    expect(ids).toEqual(expect.arrayContaining([10, 11]));
    for (const gone of [13, 14, 15]) expect(ids).not.toContain(gone);
  });

  it('excludes the seed even when it is in the library', async () => {
    const recs = await similarTo(mkDeps(), {
      ...base,
      library: [item(seed, 50, 3, 'finished')],
      limit: 10,
    });
    expect(recs.map((r) => r.game.igdbId)).not.toContain(1);
  });

  it('writes "Like <game>: <shared tags>" reasons', async () => {
    const [first] = await similarTo(mkDeps(), { ...base, limit: 10 });
    expect(first!.game.igdbId).toBe(10);
    expect(first!.reason).toMatch(/^Like Hades: /);
    const shared = first!.reason.split(': ')[1]!.split(', ');
    expect(shared).toContain('Roguelike');
    expect(shared.length).toBeLessThanOrEqual(3);
  });

  it('defaults to 24 results', async () => {
    const many = Array.from({ length: 40 }, (_, i) =>
      game(100 + i, `M${i}`, { roguelike: 1, [`t${i}`]: 0.5 }, { genres: [i % 20] }),
    );
    const recs = await similarTo(mkDeps([seed, ...many]), base);
    expect(recs).toHaveLength(SIMILAR_LIMIT);
    expect(SIMILAR_LIMIT).toBe(24);
  });

  it('caps one franchise in the results', async () => {
    const sameSeries = Array.from({ length: 30 }, (_, i) =>
      game(200 + i, `S${i}`, { roguelike: 1, mythology: 0.9, action: 0.8 }, { series: [5] }),
    );
    const others = Array.from({ length: 12 }, (_, i) =>
      game(300 + i, `O${i}`, { roguelike: 1, [`t${i}`]: 0.5 }, { genres: [i] }),
    );
    const recs = await similarTo(mkDeps([seed, ...sameSeries, ...others]), { ...base, limit: 10 });
    expect(recs).toHaveLength(10);
    expect(recs.filter((r) => r.game.series.includes(5)).length).toBeLessThanOrEqual(
      MAX_PER_SERIES,
    );
  });

  it('keeps the curated similar_games even with no tag overlap, ranked last', async () => {
    const curated = { ...seed, similarIds: [10, 11, 12] };
    const recs = await similarTo(mkDeps([curated, close, mid, far]), {
      ...base,
      game: curated,
      limit: 10,
    });
    const ids = recs.map((r) => r.game.igdbId);
    expect(ids).toContain(12);
    expect(ids.indexOf(12)).toBeGreaterThan(ids.indexOf(10));
  });

  it('bounds the device walk to 3 x limit candidates', async () => {
    const many = Array.from({ length: 40 }, (_, i) =>
      game(
        400 + i,
        `D${i}`,
        { roguelike: 1, [`t${i}`]: 0.5 },
        { genres: [i % 20], platforms: [P.windows], steamAppId: 400 + i },
      ),
    );
    const fetchDeck = vi.fn(async () => 'unsupported' as const);
    const deck: FilterDevice = {
      id: 'deck',
      kind: 'steam-deck',
      platformIds: [P.windows],
      gpuScore: null,
      cpuScore: null,
      ramGb: null,
    };
    const recs = await similarTo(mkDeps([seed, ...many], { fetchDeck }), {
      ...base,
      devices: [deck],
      limit: 4,
    });
    expect(recs).toEqual([]);
    expect(fetchDeck.mock.calls.length).toBeLessThanOrEqual(12);
    expect(fetchDeck.mock.calls.length).toBeGreaterThan(0);
  });

  it('filters by device and sets fit like recommend()', async () => {
    const ps5Only = game(10, 'Close', close.vocab, { platforms: [P.ps5] });
    const pcOnly = game(11, 'Mid', mid.vocab, { platforms: [P.windows] });
    const ps5: FilterDevice = {
      id: 'ps5',
      kind: 'ps5',
      platformIds: [P.ps5],
      gpuScore: null,
      cpuScore: null,
      ramGb: null,
    };
    const recs = await similarTo(mkDeps([seed, ps5Only, pcOnly]), {
      ...base,
      devices: [ps5],
      limit: 10,
    });
    expect(recs.map((r) => [r.game.igdbId, r.fit])).toEqual([
      [10, { status: 'green', deviceId: 'ps5' }],
    ]);
  });
});

describe('likeReason', () => {
  it('falls back to just the name when no tag is shared', () => {
    expect(likeReason(seed, far, { labels })).toBe('Like Hades');
  });

  it('hides F2P/gacha non-owned games when hideFreeToPlay is set', async () => {
    const gacha = game(20, 'Gacha', { roguelike: 1, action: 1 }, { keywords: [25210] });
    const slugged = game(21, 'Slugged', { roguelike: 1, action: 1 }, { slug: 'clash-royale' });
    const games = [...pool, gacha, slugged];
    const ids = async (hide?: boolean) =>
      (
        await similarTo(mkDeps(games), {
          ...base,
          limit: 10,
          ...(hide === undefined ? {} : { hideFreeToPlay: hide }),
        })
      ).map((r) => r.game.igdbId);
    expect(await ids(true)).not.toContain(20);
    expect(await ids(true)).not.toContain(21);
    expect(await ids(false)).toEqual(expect.arrayContaining([20, 21]));
    expect(await ids()).toEqual(expect.arrayContaining([20, 21]));
  });
});
