import { describe, expect, it } from 'vitest';
import { createNoneProvider } from '../../src/engine/explain.js';
import { recommend } from '../../src/engine/recommend.js';
import { CANDIDATES, LIBRARY, NOW, game, item } from './fixtures.js';

const mapVocab = (g: { igdbId: number }) =>
  CANDIDATES.find((c) => c.igdbId === g.igdbId)?.vocab ?? {};
const toRaw = ({ vocab: _v, ...rest }: (typeof CANDIDATES)[number]) => rest;

const deps = {
  getGames: async (ids: readonly number[]) =>
    CANDIDATES.filter((c) => ids.includes(c.igdbId)).map(toRaw),
  queryByTags: async () => CANDIDATES.map(toRaw),
  mapVocab,
  explain: createNoneProvider({ labels: {} }),
  now: () => NOW,
};

describe('recommend', () => {
  it('returns the top `limit` with ranks and reasons, never a library game', async () => {
    const recs = await recommend(deps, { library: LIBRARY, feedback: [], limit: 5 });
    expect(recs).toHaveLength(5);
    expect(recs.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5]);
    expect(recs[0]!.reason).toMatch(/^Similar to /);
    const libIds = new Set(LIBRARY.map((l) => l.game.igdbId));
    expect(recs.every((r) => !libIds.has(r.game.igdbId))).toBe(true);
    expect(recs.map((r) => r.game.igdbId)).toContain(102);
  });

  it('hides down and not_interested feedback', async () => {
    const all = await recommend(deps, { library: LIBRARY, feedback: [], limit: 50 });
    const top = all[0]!.game.igdbId;
    const second = all[1]!.game.igdbId;
    const recs = await recommend(deps, {
      library: LIBRARY,
      feedback: [
        { igdbId: top, kind: 'down' },
        { igdbId: second, kind: 'not_interested' },
      ],
      limit: 50,
    });
    const ids = recs.map((r) => r.game.igdbId);
    expect(ids).not.toContain(top);
    expect(ids).not.toContain(second);
  });

  it('surfaces an owned backlog game with the bonus and merges duplicate platform rows', async () => {
    const waiting = { ...CANDIDATES[3]!, igdbId: 900, name: 'Waiting Game' };
    const library = [
      ...LIBRARY,
      item(waiting, 0, null, 'backlog'),
      item(LIBRARY[0]!.game, 5, 2, 'finished'), // Hades again on another platform
    ];
    const recs = await recommend(deps, { library, feedback: [], limit: 50 });
    const ids = recs.map((r) => r.game.igdbId);
    expect(ids).toContain(900);
    expect(ids).not.toContain(1);
    expect(recs.find((r) => r.game.igdbId === 900)!.backlog).toBe(true);
  });

  it('copes with an empty library', async () => {
    expect(await recommend(deps, { library: [], feedback: [], limit: 20 })).toEqual([]);
    void game;
  });
});
