import { describe, expect, it } from 'vitest';
import { createNoneProvider } from '../../src/engine/explain.js';
import { backlogPoolIds, recommend } from '../../src/engine/recommend.js';
import { LIBRARY, NOW, game, item } from './fixtures.js';

let fetched = 0;
const deps = {
  getGames: async () => {
    fetched += 1;
    return [];
  },
  queryByTags: async () => {
    fetched += 1;
    return [];
  },
  mapVocab: () => ({}),
  explain: createNoneProvider({ labels: {} }),
  now: () => NOW,
};

describe('recommend with a pool', () => {
  const pool = Array.from({ length: 80 }, (_, i) =>
    item(game(1000 + i, `Backlog ${i}`, { roguelike: 0.5 }), i % 2 === 0 ? 0 : 5, null, 'backlog'),
  );

  it('ranks exactly the pool games, even played ones, and fetches no other candidates', async () => {
    fetched = 0;
    const recs = await recommend(deps, {
      library: [...LIBRARY, ...pool],
      feedback: [],
      limit: 80,
      pool: pool.map((p) => p.game.igdbId),
    });
    expect(recs).toHaveLength(80);
    expect(new Set(recs.map((r) => r.game.igdbId))).toEqual(
      new Set(pool.map((p) => p.game.igdbId)),
    );
    expect(recs.every((r) => r.backlog)).toBe(true);
    expect(fetched).toBe(0);
  });

  it('leaves out feedback-hidden games', async () => {
    const recs = await recommend(deps, {
      library: [...LIBRARY, ...pool],
      feedback: [{ igdbId: 1000, kind: 'down' }],
      limit: 80,
      pool: pool.map((p) => p.game.igdbId),
    });
    expect(recs.map((r) => r.game.igdbId)).not.toContain(1000);
  });
});

describe('backlogPoolIds', () => {
  it('takes owned games with status backlog, however long played; not finished, dropped, playing or paused', () => {
    const mk = (
      id: number,
      status: Parameters<typeof item>[3],
      hours: number | null,
      owned = true,
    ) => item(game(id, `G${id}`, {}), hours, null, status, owned);
    const library = [
      mk(1, 'backlog', 0),
      mk(2, 'backlog', 12),
      mk(3, 'finished', 1),
      mk(4, 'dropped', 0),
      mk(5, 'playing', 0),
      mk(6, 'paused', 0),
      mk(7, 'backlog', 0, false),
    ];
    expect(backlogPoolIds(library).sort()).toEqual([1, 2]);
  });
});
