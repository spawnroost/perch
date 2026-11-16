import { describe, expect, it } from 'vitest';
import { buildProfile } from '../../src/engine/profile.js';
import {
  computeIdf,
  cosine,
  diversify,
  MAX_PER_SERIES,
  MIN_SLOT_SIM,
  primaryGenre,
  rankCandidates,
  scoreCandidate,
  W_CENTROID,
  W_COSINE,
  W_KNN,
} from '../../src/engine/rank.js';
import { CANDIDATES, LIBRARY, NOW, game } from './fixtures.js';

describe('cosine', () => {
  it('is 1 for parallel vectors, 0 for orthogonal, 0 for empty', () => {
    expect(cosine({ a: 1, b: 2 }, { a: 2, b: 4 })).toBeCloseTo(1, 10);
    expect(cosine({ a: 1 }, { b: 1 })).toBe(0);
    expect(cosine({}, { a: 1 })).toBe(0);
    expect(cosine({ a: 0 }, { a: 0 })).toBe(0);
  });
  it('matches the hand-computed value', () => {
    // dot = 1*1 + 1*0 = 1, |a| = sqrt(2), |b| = sqrt(2)
    expect(cosine({ a: 1, b: 1 }, { a: 1, c: 1 })).toBeCloseTo(0.5, 10);
  });
});

describe('scoreCandidate', () => {
  const profile = { vocab: { a: 1 }, genres: {}, themes: {}, weights: [] };
  const g = (extra = {}) =>
    game(1, 'G', { a: 1 }, { rating: 50, firstRelease: new Date('2000-01-01'), ...extra });

  it('= cosine*0.6 + rating/100*0.2 (+ backlog 0.15 + recency <= 0.05)', () => {
    const s = scoreCandidate(profile, { game: g(), backlog: false }, NOW);
    expect(s).toBeCloseTo(0.6 + 0.1, 10);
    expect(scoreCandidate(profile, { game: g(), backlog: true }, NOW)).toBeCloseTo(0.85, 10);
  });

  it('release recency adds at most 0.05, fading with age, 0 when undated', () => {
    const fresh = g({ firstRelease: NOW });
    const mid = g({ firstRelease: new Date(NOW.getTime() - 5 * 365.25 * 86_400_000) });
    const s = (x: ReturnType<typeof g>) =>
      scoreCandidate(profile, { game: x, backlog: false }, NOW);
    expect(s(fresh) - 0.7).toBeCloseTo(0.05, 10);
    expect(s(mid) - 0.7).toBeCloseTo(0.025, 4);
    expect(s(g({ firstRelease: null }))).toBeCloseTo(0.7, 10);
  });

  it('treats a missing rating as 0', () => {
    expect(scoreCandidate(profile, { game: g({ rating: null }), backlog: false }, NOW)).toBeCloseTo(
      0.6,
      10,
    );
  });
});

describe('diversify', () => {
  const mk = (id: number, genre: number) => ({
    game: game(id, `G${id}`, {}, { genres: [genre] }),
    score: 100 - id,
  });
  const genreOf = (x: { game: Parameters<typeof primaryGenre>[0] }) => primaryGenre(x.game);

  it('allows at most 2 of the same primary genre in any window of 5', () => {
    // Four of genre 1 up top, then one each of four other genres.
    const items = [mk(1, 1), mk(2, 1), mk(3, 1), mk(4, 1), mk(5, 2), mk(6, 3), mk(7, 4), mk(8, 5)];
    const out = diversify(items);
    expect(out).toHaveLength(8);
    expect(new Set(out.map((o) => o.game.igdbId)).size).toBe(8);
    for (let i = 0; i + 5 <= out.length; i++) {
      const counts = new Map<number | string, number>();
      for (const o of out.slice(i, i + 5))
        counts.set(genreOf(o)!, (counts.get(genreOf(o)!) ?? 0) + 1);
      expect(Math.max(...counts.values())).toBeLessThanOrEqual(2);
    }
  });

  it('keeps the original order when there is nothing to fix, and is greedy otherwise', () => {
    const ok = [mk(1, 1), mk(2, 1), mk(3, 2), mk(4, 1)];
    expect(diversify(ok).map((o) => o.game.igdbId)).toEqual([1, 2, 3, 4]);
    const clumped = [mk(1, 1), mk(2, 1), mk(3, 1), mk(4, 2), mk(5, 3)];
    expect(diversify(clumped).map((o) => o.game.igdbId)).toEqual([1, 2, 4, 5, 3]);
  });

  it('window 1 puts no limit on repeats', () => {
    const items = [mk(1, 1), mk(2, 1), mk(3, 1), mk(4, 2)];
    expect(diversify(items, 1, 1).map((o) => o.game.igdbId)).toEqual([1, 2, 3, 4]);
  });

  it('falls back to score order when only one genre is left', () => {
    const out = diversify([1, 2, 3, 4, 5].map((i) => mk(i, 1)));
    expect(out.map((o) => o.game.igdbId)).toEqual([1, 2, 3, 4, 5]);
  });

  it('ignores games with no genre (and the generic Indie genre)', () => {
    const none = [1, 2, 3, 4].map((i) => ({ game: game(i, `N${i}`, {}), score: 10 - i }));
    expect(diversify(none).map((o) => o.game.igdbId)).toEqual([1, 2, 3, 4]);
    expect(primaryGenre(game(1, 'x', {}, { genres: [32, 12] }))).toBe(12);
    expect(primaryGenre(game(1, 'x', {}, { genres: [] }))).toBeUndefined();
  });
});

describe('rankCandidates on the fixed 12-game library', () => {
  const profile = buildProfile({ library: LIBRARY, feedback: [], now: NOW });
  const ranked = rankCandidates(
    profile,
    CANDIDATES.map((game) => ({ game, backlog: false })),
    NOW,
  );
  const pos = (id: number) => ranked.findIndex((r) => r.game.igdbId === id);

  it('returns every candidate once, with scores', () => {
    expect(ranked).toHaveLength(CANDIDATES.length);
    expect(new Set(ranked.map((r) => r.game.igdbId)).size).toBe(CANDIDATES.length);
  });

  it('a roguelike/mythology game beats a sports game for a Hades-heavy profile', () => {
    expect(pos(102)).toBeLessThan(pos(103));
    expect(pos(102)).toBeLessThan(pos(104));
    expect(pos(102)).toBeLessThan(pos(116));
  });

  it('roguelike/action games lead; sports, racing and cozy stay out of the top 8', () => {
    expect(pos(102)).toBeLessThan(3);
    expect(pos(101)).toBeLessThan(5);
    for (const id of [103, 104, 105, 107, 109, 116]) expect(pos(id)).toBeGreaterThanOrEqual(8);
    expect(pos(108)).toBeLessThan(pos(107)); // dark souls-like beats cozy farm
  });

  it('keeps the diversity rule in the final order', () => {
    for (let i = 0; i + 5 <= ranked.length; i++) {
      const counts = new Map<number, number>();
      for (const r of ranked.slice(i, i + 5)) {
        const g = primaryGenre(r.game);
        if (g !== undefined) counts.set(g, (counts.get(g) ?? 0) + 1);
      }
      expect(Math.max(0, ...counts.values())).toBeLessThanOrEqual(2);
    }
  });

  it('with a limit, diversifies only the top limit x 3 (rest is dropped)', () => {
    const limited = rankCandidates(
      profile,
      CANDIDATES.map((game) => ({ game, backlog: false })),
      NOW,
      4,
    );
    expect(limited).toHaveLength(12);
    const byScore = [...ranked].sort((a, b) => b.score - a.score).slice(0, 12);
    expect(new Set(limited.map((r) => r.game.igdbId))).toEqual(
      new Set(byScore.map((r) => r.game.igdbId)),
    );
  });

  it('the backlog bonus lifts a backlog game above an otherwise equal one', () => {
    const twins = [
      { game: game(1, 'Plain', { roguelike: 1 }, { genres: [1] }), backlog: false },
      { game: game(2, 'Backlog', { roguelike: 1 }, { genres: [2] }), backlog: true },
    ];
    expect(rankCandidates(profile, twins, NOW).map((r) => r.game.name)).toEqual([
      'Backlog',
      'Plain',
    ]);
  });
});

describe('computeIdf', () => {
  it('= ln((N+1)/(df+1)) + 1, counting games with tag > 0', () => {
    const games: { vocab: Record<string, number> }[] = [
      { vocab: { fantasy: 1, rare: 0.5 } },
      { vocab: { fantasy: 0.3, zero: 0 } },
      { vocab: { fantasy: 1 } },
    ];
    const idf = computeIdf(games);
    expect(idf.fantasy).toBeCloseTo(Math.log(4 / 4) + 1, 10);
    expect(idf.rare).toBeCloseTo(Math.log(4 / 2) + 1, 10);
    expect(idf.zero).toBeUndefined();
  });
  it('is empty for no games', () => {
    expect(computeIdf([])).toEqual({});
  });
});

describe('idf-weighted cosine', () => {
  it('is unchanged without idf and with an all-ones idf', () => {
    const a = { x: 1, y: 2 };
    const b = { x: 2, z: 1 };
    expect(cosine(a, b, { x: 1, y: 1, z: 1 })).toBeCloseTo(cosine(a, b), 10);
  });
  it('a common tag shared by everything no longer outranks a rare shared tag', () => {
    const profile = { vocab: { common: 1, rare: 1 }, genres: {}, themes: {}, weights: [] };
    const commonOnly = game(1, 'C', { common: 1, other: 1 }, { rating: 0, firstRelease: null });
    const rareOnly = game(2, 'R', { rare: 1, other: 1 }, { rating: 0, firstRelease: null });
    const cands = [commonOnly, rareOnly].map((g) => ({ game: g, backlog: false }));
    // Without idf the two tie; with idf the rare-tag game wins.
    const tie = cands.map((c) => scoreCandidate(profile, c, NOW));
    expect(tie[0]).toBeCloseTo(tie[1]!, 10);
    const idf = computeIdf([
      { vocab: { common: 1, rare: 1 } },
      ...Array.from({ length: 20 }, () => ({ vocab: { common: 1 } })),
      commonOnly,
      rareOnly,
    ]);
    const ranked = rankCandidates(profile, cands, NOW, undefined, { idf });
    expect(ranked[0]!.game.name).toBe('R');
  });
});

describe('item-kNN blend', () => {
  // Profile dominated by a heavy metroidvania; a light FPS sits in the library as a source.
  const profile = { vocab: { metroidvania: 1, fps: 0.1 }, genres: {}, themes: {}, weights: [] };
  const sources: { vocab: Record<string, number> }[] = [
    { vocab: { metroidvania: 1 } },
    { vocab: { fps: 1, stealth: 1 } },
  ];
  const plain = { rating: 0, firstRelease: null };
  const fpsGame = { game: game(1, 'F', { fps: 1, stealth: 1 }, plain), backlog: false };

  it('without sources, the score is the centroid score', () => {
    expect(scoreCandidate(profile, fpsGame, NOW, { sources: [] })).toBeCloseTo(
      scoreCandidate(profile, fpsGame, NOW),
      10,
    );
  });
  it('blends centroid cosine with the max cosine to any source game', () => {
    const centroid = cosine(profile.vocab, fpsGame.game.vocab);
    const expected = (W_CENTROID * centroid + W_KNN * 1) * W_COSINE;
    expect(scoreCandidate(profile, fpsGame, NOW, { sources })).toBeCloseTo(expected, 10);
  });
  it('lifts a game that matches one light library game', () => {
    const mv = { game: game(2, 'M', { metroidvania: 0.5, other: 1 }, plain), backlog: false };
    const without = rankCandidates(profile, [mv, fpsGame], NOW);
    expect(without[0]!.game.name).toBe('M');
    const withSources = rankCandidates(profile, [mv, fpsGame], NOW, undefined, { sources });
    expect(withSources[0]!.game.name).toBe('F');
  });
});

describe('per-source slots', () => {
  const plain = { rating: 0, firstRelease: null };
  const sources: { vocab: Record<string, number> }[] = [
    { vocab: { mv: 1 } },
    { vocab: { fps: 1 } },
  ];
  const profile = { vocab: { mv: 1 }, genres: {}, themes: {}, weights: [] };
  const mv = Array.from({ length: 6 }, (_, i) =>
    game(i + 1, `M${i + 1}`, { mv: 1, [`x${i}`]: 0.1 * i }, { ...plain, genres: [i + 1] }),
  );
  const fps = game(99, 'F', { fps: 1, mv: 0.05 }, { ...plain, genres: [99] });
  const cands = [...mv, fps].map((g) => ({ game: g, backlog: false }));

  it('moves the best match of an unshown source inside the limit', () => {
    const top = rankCandidates(profile, cands, NOW, 4, { sources, slots: 1 }).slice(0, 4);
    expect(top.map((t) => t.game.name)).toContain('F');
    expect(top.map((t) => t.game.name)).toContain('M1');
  });
  it('limit under 4: no slots, so organic games are not pushed out', () => {
    const withSlots = rankCandidates(profile, cands, NOW, 3, { sources, slots: 5 });
    const without = rankCandidates(profile, cands, NOW, 3, { sources, slots: 0 });
    expect(withSlots.map((t) => t.game.name)).toEqual(without.map((t) => t.game.name));
  });
  it('slots are capped at a quarter of the limit', () => {
    const src3 = [...sources, { vocab: { rpg: 1 } }, { vocab: { puz: 1 } }];
    const extra = [
      game(98, 'R', { rpg: 1 }, { ...plain, genres: [98] }),
      game(97, 'P', { puz: 1 }, { ...plain, genres: [97] }),
    ].map((g) => ({ game: g, backlog: false }));
    const top = rankCandidates(profile, [...cands, ...extra], NOW, 4, {
      sources: src3,
      slots: 5,
    }).slice(0, 4);
    const names = top.map((t) => t.game.name);
    expect(names.filter((n) => ['F', 'R', 'P'].includes(n))).toHaveLength(1);
  });
  it('MIN_SLOT_SIM: a source whose best match is only weakly similar gets no slot', () => {
    expect(MIN_SLOT_SIM).toBe(0.3);
    const weakSources = [...sources, { vocab: { zz: 1 } }];
    // cosine to { zz: 1 } is about 0.1, below the floor.
    const weak = game(50, 'W', { zz: 0.1, junk: 1 }, { ...plain, genres: [50] });
    const c = [...cands.filter((x) => x.game.name !== 'F'), { game: weak, backlog: false }];
    const top = rankCandidates(profile, c, NOW, 4, { sources: weakSources, slots: 5 }).slice(0, 4);
    expect(top.map((t) => t.game.name)).not.toContain('W');
  });
  it('MIN_SLOT_SIM: a close enough best match still gets the slot', () => {
    const weakSources = [...sources, { vocab: { zz: 1 } }];
    const ok = game(51, 'OK', { zz: 1, junk: 1 }, { ...plain, genres: [51] }); // cosine ~0.71
    const c = [...cands.filter((x) => x.game.name !== 'F'), { game: ok, backlog: false }];
    const top = rankCandidates(profile, c, NOW, 4, { sources: weakSources, slots: 1 }).slice(0, 4);
    expect(top.map((t) => t.game.name)).toContain('OK');
  });
  it('no slots, no change', () => {
    const top = rankCandidates(profile, cands, NOW, 3, { sources, slots: 0 }).slice(0, 3);
    expect(top.map((t) => t.game.name)).not.toContain('F');
  });
});

describe('series cap', () => {
  const plain = { rating: 0, firstRelease: null };
  const profile = { vocab: { a: 1 }, genres: {}, themes: {}, weights: [] };
  // Descending scores: C1..C4 (series 7) are best, then O1..O4 with no series.
  const mk = (id: number, name: string, series: number[], a: number) =>
    game(id, name, { a, b: 1 - a }, { ...plain, series, genres: [id] });
  const cands = [
    ...[1, 2, 3, 4].map((i) => mk(i, `C${i}`, [7], 1 - i * 0.01)),
    ...[1, 2, 3, 4].map((i) => mk(10 + i, `O${i}`, [], 0.5 - i * 0.01)),
  ].map((g) => ({ game: g, backlog: false }));
  const names = (r: { game: { name: string } }[]) => r.map((x) => x.game.name);

  it('exports MAX_PER_SERIES = 2', () => {
    expect(MAX_PER_SERIES).toBe(2);
  });
  it('puts at most 2 games of one series in the top limit and moves the next up', () => {
    const top = rankCandidates(profile, cands, NOW, 4);
    expect(names(top.slice(0, 4))).toEqual(['C1', 'C2', 'O1', 'O2']);
    expect(names(top.slice(4)).sort()).toEqual(['C3', 'C4', 'O3', 'O4']);
  });
  it('games sharing any series id count together', () => {
    const c = [
      mk(1, 'A1', [1, 2], 0.99),
      mk(2, 'A2', [2], 0.98),
      mk(3, 'A3', [9, 2], 0.97),
      mk(4, 'B', [], 0.5),
    ].map((g) => ({ game: g, backlog: false }));
    expect(names(rankCandidates(profile, c, NOW, 3).slice(0, 3))).toEqual(['A1', 'A2', 'B']);
  });
  it('never caps games with an empty series', () => {
    const c = [1, 2, 3, 4].map((i) => ({ game: mk(i, `O${i}`, [], 1 - i * 0.01), backlog: false }));
    expect(names(rankCandidates(profile, c, NOW, 4))).toEqual(['O1', 'O2', 'O3', 'O4']);
  });
  it('without a limit the list is unchanged', () => {
    expect(names(rankCandidates(profile, cands, NOW)).slice(0, 4)).toEqual([
      'C1',
      'C2',
      'C3',
      'C4',
    ]);
  });
  it('slot picks count toward the cap but are never removed', () => {
    const sources: { vocab: Record<string, number> }[] = [{ vocab: { a: 1 } }, { vocab: { z: 1 } }];
    const z = game(99, 'Z', { z: 1 }, { ...plain, series: [7], genres: [99] });
    const c = [...cands, { game: z, backlog: false }];
    const top = rankCandidates(profile, c, NOW, 4, { sources, slots: 1 }).slice(0, 4);
    expect(names(top)).toContain('Z');
    expect(top.filter((t) => t.game.series.includes(7)).length).toBeLessThanOrEqual(2);
  });
});
