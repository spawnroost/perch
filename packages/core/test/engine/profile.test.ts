import { describe, expect, it } from 'vitest';
import { buildProfile } from '../../src/engine/profile.js';
import { LIBRARY, NOW, game, item } from './fixtures.js';

const weightOf = (p: ReturnType<typeof buildProfile>, id: number) =>
  p.weights.find((w) => w.igdbId === id)?.weight;

/** Three fresh fillers soak up the last-3 boost so the games under test are unboosted. */
const fillers = [90, 91, 92].map((id, i) => item(game(id, `Filler ${id}`, { action: 1 }), 1, i));

describe('buildProfile weights', () => {
  it('weight = log1p(hours) x recency (45 d half-life)', () => {
    const a = game(1, 'A', { roguelike: 1 });
    const b = game(2, 'B', { roguelike: 1 });
    const p = buildProfile({
      library: [...fillers, item(a, 10, 100), item(b, 10, 145)],
      feedback: [],
      now: NOW,
    });
    expect(weightOf(p, 1)).toBeCloseTo(Math.log1p(10) * 0.5 ** (100 / 45), 10);
    expect(weightOf(p, 2)! / weightOf(p, 1)!).toBeCloseTo(0.5, 10);
  });

  it('a missing last-played date counts as a 0.5 recency factor', () => {
    const p = buildProfile({
      library: [...fillers, item(game(1, 'A', { x: 1 }), 10, null)],
      feedback: [],
      now: NOW,
    });
    expect(weightOf(p, 1)).toBeCloseTo(Math.log1p(10) * 0.5, 10);
  });

  it('dropped games count 0.3x', () => {
    const p = buildProfile({
      library: [
        ...fillers,
        item(game(1, 'A', { x: 1 }), 10, 100, 'finished'),
        item(game(2, 'B', { x: 1 }), 10, 100, 'dropped'),
      ],
      feedback: [],
      now: NOW,
    });
    expect(weightOf(p, 2)! / weightOf(p, 1)!).toBeCloseTo(0.3, 10);
  });

  it('paused games weigh like played ones, with no dropped penalty', () => {
    const p = buildProfile({
      library: [
        ...fillers,
        item(game(1, 'A', { x: 1 }), 10, 100, 'finished'),
        item(game(2, 'B', { x: 1 }), 10, 100, 'paused'),
      ],
      feedback: [],
      now: NOW,
    });
    expect(weightOf(p, 2)).toBeCloseTo(weightOf(p, 1)!, 10);
  });

  it('the 3 most recently played get x1.5', () => {
    const games = [1, 2, 3, 4].map((id) => game(id, `G${id}`, { x: 1 }));
    // Same hours, last played 1, 2, 3 and 4 days ago; the fourth is not boosted.
    const p = buildProfile({
      library: games.map((g, i) => item(g, 10, i + 1)),
      feedback: [],
      now: NOW,
    });
    const base = (days: number) => Math.log1p(10) * 0.5 ** (days / 45);
    expect(weightOf(p, 1)).toBeCloseTo(base(1) * 1.5, 10);
    expect(weightOf(p, 3)).toBeCloseTo(base(3) * 1.5, 10);
    expect(weightOf(p, 4)).toBeCloseTo(base(4), 10);
  });

  it('undated games are never in the last 3', () => {
    const p = buildProfile({
      library: [item(game(1, 'A', { x: 1 }), 10, null)],
      feedback: [],
      now: NOW,
    });
    expect(weightOf(p, 1)).toBeCloseTo(Math.log1p(10) * 0.5, 10);
  });

  it('feedback adds +1 for up and -1 for down', () => {
    const lib = [
      ...fillers,
      item(game(1, 'A', { x: 1 }), 10, 100),
      item(game(2, 'B', { x: 1 }), 10, 100),
      item(game(3, 'C', { x: 1 }), 10, 100),
    ];
    const base = Math.log1p(10) * 0.5 ** (100 / 45);
    const p = buildProfile({
      library: lib,
      feedback: [
        { igdbId: 1, kind: 'up' },
        { igdbId: 2, kind: 'down' },
        { igdbId: 3, kind: 'played' },
      ],
      now: NOW,
    });
    expect(weightOf(p, 1)).toBeCloseTo(base + 1, 10);
    expect(weightOf(p, 2)).toBeCloseTo(base - 1, 10);
    expect(weightOf(p, 3)).toBeCloseTo(base, 10);
  });

  it('missing hours count as 1 h; weights are sorted high to low', () => {
    const p = buildProfile({ library: LIBRARY, feedback: [], now: NOW });
    expect(p.weights[0]!.igdbId).toBe(1); // Hades: most hours, most recent
    const ws = p.weights.map((w) => w.weight);
    expect([...ws].sort((x, y) => y - x)).toEqual(ws);
    const q = buildProfile({
      library: [item(game(1, 'A', { x: 1 }), null, 1)],
      feedback: [],
      now: NOW,
    });
    // null hours: base weight log1p(1) (x0.5^(1/45) recency, x1.5 last-3 boost); 0 h is still 0.
    expect(weightOf(q, 1)).toBeCloseTo(Math.log1p(1) * 0.5 ** (1 / 45) * 1.5, 10);
    const z = buildProfile({
      library: [item(game(1, 'A', { x: 1 }), 0, 1)],
      feedback: [],
      now: NOW,
    });
    expect(weightOf(z, 1)).toBe(0);
  });
});

describe('buildProfile vectors', () => {
  it('normalises each list to 0-1 with the strongest entry at 1', () => {
    const p = buildProfile({ library: LIBRARY, feedback: [], now: NOW });
    for (const vec of [p.vocab, p.genres, p.themes]) {
      const vals = Object.values(vec);
      expect(Math.max(...vals)).toBeCloseTo(1, 10);
      expect(Math.min(...vals)).toBeGreaterThan(0);
      expect(Math.max(...vals)).toBeLessThanOrEqual(1);
    }
    expect(p.vocab.roguelike).toBeGreaterThan(p.vocab.cozy ?? 0);
  });

  it('sums game vectors by weight', () => {
    const p = buildProfile({
      library: [
        item(game(1, 'A', { a: 1, b: 0.5 }, { genres: [12], themes: [17] }), 10, 1),
        item(game(2, 'B', { b: 1 }, { genres: [12, 31] }), 10, 2),
      ],
      feedback: [],
      now: NOW,
    });
    const w1 = weightOf(p, 1)!;
    const w2 = weightOf(p, 2)!;
    const max = Math.max(w1, w1 * 0.5 + w2);
    expect(p.vocab.a).toBeCloseTo(w1 / max, 10);
    expect(p.vocab.b).toBeCloseTo((w1 * 0.5 + w2) / max, 10);
    expect(p.genres[12]).toBeCloseTo(1, 10);
    expect(p.genres[31]).toBeCloseTo(w2 / (w1 + w2), 10);
    expect(p.themes[17]).toBeCloseTo(1, 10);
  });

  it('keeps only the top 15 per list', () => {
    const vocab = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`v${i}`, 1 - i * 0.01]));
    const genres = Array.from({ length: 20 }, (_, i) => i + 1);
    const p = buildProfile({
      library: [item(game(1, 'A', vocab, { genres, themes: genres }), 10, 1)],
      feedback: [],
      now: NOW,
    });
    expect(Object.keys(p.vocab)).toHaveLength(15);
    expect(Object.keys(p.genres)).toHaveLength(15);
    expect(Object.keys(p.themes)).toHaveLength(15);
    expect(p.vocab.v0).toBe(1);
    expect(p.vocab.v14).toBeDefined();
    expect(p.vocab.v15).toBeUndefined();
  });

  it('negative feedback cannot push a value below 0', () => {
    const p = buildProfile({
      library: [item(game(1, 'A', { a: 1 }), 1, 1), item(game(2, 'B', { b: 1 }), 20, 2)],
      feedback: [
        { igdbId: 1, kind: 'down' },
        { igdbId: 1, kind: 'down' },
      ],
      now: NOW,
    });
    expect(p.vocab.a).toBeUndefined();
    expect(p.vocab.b).toBeCloseTo(1, 10);
  });

  it('personal ratings scale the base weight: 5 x1.5, 4 x1.2, 3/null x1, 2 x0.5', () => {
    const rated = (id: number, rating: number | null) => ({
      ...item(game(id, `G${id}`, { x: 1 }), 10, 100),
      rating,
    });
    const p = buildProfile({
      library: [...fillers, rated(1, null), rated(2, 5), rated(3, 4), rated(4, 3), rated(5, 2)],
      feedback: [],
      now: NOW,
    });
    const base = weightOf(p, 1)!;
    expect(weightOf(p, 2)! / base).toBeCloseTo(1.5, 10);
    expect(weightOf(p, 3)! / base).toBeCloseTo(1.2, 10);
    expect(weightOf(p, 4)! / base).toBeCloseTo(1, 10);
    expect(weightOf(p, 5)! / base).toBeCloseTo(0.5, 10);
  });

  it('a 1 rating makes the weight negative (-max(base, 0.5)) and feedback still adds on top', () => {
    const rated = (id: number, hours: number, rating: number) => ({
      ...item(game(id, `G${id}`, { x: 1 }), hours, 100),
      rating,
    });
    const p = buildProfile({
      library: [...fillers, rated(1, 10, 1), rated(2, 0, 1)],
      feedback: [{ igdbId: 2, kind: 'up' }],
      now: NOW,
    });
    expect(weightOf(p, 1)).toBeCloseTo(-Math.max(Math.log1p(10) * 0.5 ** (100 / 45), 0.5), 10);
    expect(weightOf(p, 2)).toBeCloseTo(-0.5 + 1, 10);
  });

  it('ratings change which game leads the ranking', () => {
    const lib = (ra: number | null, rb: number | null) => [
      { ...item(game(1, 'A', { a: 1 }), 10, 100), rating: ra },
      { ...item(game(2, 'B', { b: 1 }), 10, 100), rating: rb },
    ];
    const top = (l: ReturnType<typeof lib>) =>
      buildProfile({ library: l, feedback: [], now: NOW }).weights[0]!.igdbId;
    expect(top(lib(5, 2))).toBe(1);
    expect(top(lib(2, 5))).toBe(2);
    const p = buildProfile({ library: lib(1, null), feedback: [], now: NOW });
    expect(p.vocab.a).toBeUndefined();
    expect(p.vocab.b).toBeCloseTo(1, 10);
  });

  it('an empty library gives an empty profile', () => {
    const p = buildProfile({ library: [], feedback: [], now: NOW });
    expect(p).toEqual({ vocab: {}, genres: {}, themes: {}, weights: [] });
  });
});
