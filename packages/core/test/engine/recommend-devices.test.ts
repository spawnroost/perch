import { describe, expect, it, vi } from 'vitest';
import { IGDB_PLATFORM as P } from '../../src/devices/presets.js';
import { createNoneProvider } from '../../src/engine/explain.js';
import type { FilterDevice, FitRequirements } from '../../src/engine/filters.js';
import { recommend } from '../../src/engine/recommend.js';
import type { EngineGame, LibraryItem, RawGame } from '../../src/engine/types.js';

const NOW = new Date('2026-06-01T00:00:00Z');
const toRaw = ({ vocab: _v, ...rest }: EngineGame): RawGame => rest;

const mk = (id: number, rating: number, extra: Partial<EngineGame> = {}): EngineGame => ({
  igdbId: id,
  name: `G${id}`,
  firstRelease: new Date('2020-01-01T00:00:00Z'),
  genres: [12],
  themes: [1],
  similarIds: [],
  series: [],
  rating,
  ratingCount: 1000,
  vocab: { g12: 1 },
  platforms: [P.windows, P.ps5],
  steamAppId: id * 10,
  ...extra,
});

const lib: LibraryItem = {
  game: mk(1, 90, { steamAppId: null }),
  hours: 100,
  lastPlayed: new Date('2026-05-30T00:00:00Z'),
  status: 'playing',
  owned: true,
};
// Scores fall with the id, so ranking is G10 > G11 > G12 ...
const pool = (n: number, extra: (id: number) => Partial<EngineGame> = () => ({})) =>
  Array.from({ length: n }, (_, i) => mk(10 + i, 90 - i, extra(10 + i)));

const mkDeps = (games: EngineGame[], more: Record<string, unknown> = {}) => ({
  getGames: async () => [],
  queryByTags: async () => games.map(toRaw),
  mapVocab: (g: { igdbId: number }) => games.find((c) => c.igdbId === g.igdbId)?.vocab ?? {},
  explain: createNoneProvider({ labels: {} }),
  now: () => NOW,
  ...more,
});

const input = (devices: FilterDevice[], limit = 3) => ({
  library: [lib],
  feedback: [],
  limit,
  devices,
});
const pcDev = (o: Partial<FilterDevice> = {}): FilterDevice => ({
  id: 'pc1',
  kind: 'pc',
  platformIds: [P.windows],
  gpuScore: 5000,
  cpuScore: 5000,
  ramGb: 16,
  ...o,
});
const reqOk: FitRequirements = {
  minGpuScore: 1000,
  minCpuScore: 1000,
  minRamGb: 4,
  recGpuScore: 2000,
  recCpuScore: 2000,
  recRamGb: 8,
};

describe('recommend with devices', () => {
  it('without devices behaves as before and sets no fit', async () => {
    const recs = await recommend(mkDeps(pool(6)), { library: [lib], feedback: [], limit: 3 });
    expect(recs).toHaveLength(3);
    expect(recs[0]!.fit).toBeUndefined();
  });

  it('drops hidden games, fills the limit from further down, and sets fit', async () => {
    const fetchRequirements = async (g: EngineGame) =>
      g.igdbId === 10 ? { ...reqOk, minGpuScore: 99999 } : reqOk;
    const recs = await recommend(mkDeps(pool(8), { fetchRequirements }), input([pcDev()]));
    const ids = recs.map((r) => r.game.igdbId);
    expect(ids).toHaveLength(3);
    expect(ids).not.toContain(10);
    expect(recs.map((r) => r.rank)).toEqual([1, 2, 3]);
    expect(recs[0]!.fit).toEqual({ status: 'green', deviceId: 'pc1' });
  });

  it('a low-end PC marks AAA picks yellow', async () => {
    const aaa = { ...reqOk, recGpuScore: 14000 };
    const recs = await recommend(
      mkDeps(pool(4), { fetchRequirements: async () => aaa }),
      input([pcDev()]),
    );
    expect(recs.every((r) => r.fit?.status === 'yellow')).toBe(true);
  });

  it('maps Steam Deck categories and hides unsupported', async () => {
    const cat: Record<number, string> = { 100: 'unsupported', 110: 'verified', 120: 'playable' };
    const fetchDeck = async (appId: number) => cat[appId] ?? 'unknown';
    const deck: FilterDevice = {
      id: 'deck',
      kind: 'steam-deck',
      platformIds: [P.windows],
      gpuScore: null,
      cpuScore: null,
      ramGb: null,
    };
    const recs = await recommend(mkDeps(pool(5), { fetchDeck }), input([deck], 4));
    expect(recs.map((r) => [r.game.igdbId, r.fit?.status])).toEqual([
      [11, 'green'],
      [12, 'yellow'],
      [13, 'unknown'],
      [14, 'unknown'],
    ]);
  });

  it('hides games on a platform the console does not play, without fetching', async () => {
    const ps4: FilterDevice = {
      id: 'ps4',
      kind: 'ps4',
      platformIds: [P.ps4],
      gpuScore: null,
      cpuScore: null,
      ramGb: null,
    };
    const fetchRequirements = vi.fn(async () => reqOk);
    const games = pool(5, (id) => ({ platforms: id === 12 ? [P.ps4] : [P.windows] }));
    const recs = await recommend(mkDeps(games, { fetchRequirements }), input([ps4], 5));
    expect(recs.map((r) => r.game.igdbId)).toEqual([12]);
    expect(recs[0]!.fit).toEqual({ status: 'green', deviceId: 'ps4' });
    expect(fetchRequirements).not.toHaveBeenCalled();
  });

  it('uses the best device across several', async () => {
    const ps5: FilterDevice = {
      id: 'ps5',
      kind: 'ps5',
      platformIds: [P.ps5],
      gpuScore: null,
      cpuScore: null,
      ramGb: null,
    };
    const weak = pcDev({ gpuScore: 1 });
    const fetchRequirements = vi.fn(async () => reqOk);
    const recs = await recommend(mkDeps(pool(4), { fetchRequirements }), input([weak, ps5], 2));
    expect(recs.every((r) => r.fit?.deviceId === 'ps5' && r.fit.status === 'green')).toBe(true);
    // The console already gives green, so no PC lookup is needed.
    expect(fetchRequirements).not.toHaveBeenCalled();
  });

  it('fetches lazily: only as many games as needed to fill the limit', async () => {
    const fetchRequirements = vi.fn(async () => reqOk);
    const recs = await recommend(
      mkDeps(pool(30), { fetchRequirements }),
      input([pcDev()], 3),
    );
    expect(recs).toHaveLength(3);
    expect(fetchRequirements).toHaveBeenCalledTimes(3);
  });

  it('skips fetching for games without a steamAppId', async () => {
    const fetchRequirements = vi.fn(async () => reqOk);
    const games = pool(4, () => ({ steamAppId: null }));
    const recs = await recommend(mkDeps(games, { fetchRequirements }), input([pcDev()], 2));
    expect(fetchRequirements).not.toHaveBeenCalled();
    expect(recs.every((r) => r.fit?.status === 'unknown')).toBe(true);
  });

  it('a fetch error gives unknown instead of throwing', async () => {
    const fetchRequirements = async () => {
      throw new Error('steam down');
    };
    const recs = await recommend(mkDeps(pool(4), { fetchRequirements }), input([pcDev()], 2));
    expect(recs).toHaveLength(2);
    expect(recs.every((r) => r.fit?.status === 'unknown')).toBe(true);
  });
});
