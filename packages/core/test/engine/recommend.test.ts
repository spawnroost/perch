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

  it('hides games with played feedback', async () => {
    const all = await recommend(deps, { library: LIBRARY, feedback: [], limit: 50 });
    const top = all[0]!.game.igdbId;
    const recs = await recommend(deps, {
      library: LIBRARY,
      feedback: [{ igdbId: top, kind: 'played' }],
      limit: 50,
    });
    expect(recs.map((r) => r.game.igdbId)).not.toContain(top);
  });

  it('explains only from library games that count as taste signal', async () => {
    const seen: (readonly { igdbId: number }[])[] = [];
    const spy = {
      name: 'spy',
      explain: async (reqs: readonly { library: readonly { igdbId: number }[] }[]) => {
        seen.push(...reqs.map((r) => r.library));
        return reqs.map(() => 'r');
      },
    };
    const dropped = item({ ...LIBRARY[0]!.game, igdbId: 20, name: 'D' }, 50, 3, 'dropped');
    const downed = item({ ...LIBRARY[0]!.game, igdbId: 21, name: 'V' }, 50, 3, 'finished');
    const unplayed = item({ ...LIBRARY[0]!.game, igdbId: 22, name: 'U' }, 0, null, 'backlog');
    const recs = await recommend(
      { ...deps, explain: spy },
      {
        library: [...LIBRARY, dropped, downed, unplayed],
        feedback: [{ igdbId: 21, kind: 'down' }],
        limit: 3,
      },
    );
    expect(recs).toHaveLength(3);
    // Dropped games are weighted but excluded as a "similar to" source.
    const libIds = new Set(seen[0]!.map((g) => g.igdbId));
    for (const id of [20, 21, 22]) expect(libIds.has(id)).toBe(false);
    expect(libIds.has(1)).toBe(true);
    expect(seen[1]).toBe(seen[0]); // built once, shared by every request
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
