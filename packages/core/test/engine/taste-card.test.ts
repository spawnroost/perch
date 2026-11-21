import { describe, expect, it } from 'vitest';
import {
  PLAYSTYLE_FALLBACK,
  playstyleLabel,
  tasteSummary,
  type TasteArt,
} from '../../src/engine/taste-card.js';
import type { LibraryItem } from '../../src/engine/types.js';
import { tasteSummarySchema } from '../../src/schemas/taste-card.js';
import { NOW, game, item } from './fixtures.js';

const labels = { metroidvania: 'Metroidvania', exploration: 'Exploration', cozy: 'Cozy' };
const run = (library: LibraryItem[], art: Record<number, TasteArt> = {}) =>
  tasteSummary({
    library,
    feedback: [],
    labels,
    art: new Map(Object.entries(art).map(([k, v]) => [Number(k), v])),
    now: NOW,
  });
const on = (i: LibraryItem, platform: string): LibraryItem => ({ ...i, platform });

describe('playstyleLabel', () => {
  it('joins the strongest genre tag and the strongest manner tag', () => {
    expect(playstyleLabel({ metroidvania: 1, exploration: 0.7, rpg: 0.4 })).toBe(
      'Metroidvania explorer',
    );
    expect(playstyleLabel({ shooter: 0.9, challenging: 0.8 })).toBe('Shooter challenger');
  });

  it('picks by weight, and by table order on a tie', () => {
    expect(playstyleLabel({ rpg: 0.5, roguelike: 0.9 })).toBe('Roguelike fan');
    expect(playstyleLabel({ rpg: 0.5, roguelike: 0.5 })).toBe(
      playstyleLabel({ roguelike: 0.5, rpg: 0.5 }),
    );
  });

  it('falls back to the manner alone, or to the fallback when nothing is strong enough', () => {
    expect(playstyleLabel({ exploration: 0.8 })).toBe('Explorer');
    expect(playstyleLabel({ rpg: 0.1 })).toBe(PLAYSTYLE_FALLBACK);
    expect(playstyleLabel({})).toBe(PLAYSTYLE_FALLBACK);
  });
});

describe('tasteSummary', () => {
  const hades = game(1, 'Hades', { roguelike: 1, action: 0.8 }, { genres: [25], themes: [17] });
  const hollow = game(
    2,
    'Hollow Knight',
    { metroidvania: 1, exploration: 0.8 },
    { genres: [8, 31], themes: [1] },
  );
  const stardew = game(3, 'Stardew Valley', { cozy: 1 }, { genres: [13], themes: [33] });

  it('returns a sensible empty state for an empty library', () => {
    const s = run([]);
    expect(s).toMatchObject({
      empty: true,
      gameCount: 0,
      totalHours: 0,
      topTastes: [],
      mostPlayed: null,
      playstyle: null,
      statusCounts: { playing: 0, finished: 0, dropped: 0, backlog: 0, paused: 0 },
      platforms: [],
      topRated: [],
      covers: [],
    });
    expect(tasteSummarySchema.safeParse(s).success).toBe(true);
  });

  it('totals hours and counts statuses once per game, the latest status winning', () => {
    const s = run([
      on(item(hades, 10, 1, 'finished'), 'pc'),
      on(item(hades, 5, 30, 'playing'), 'ps5'),
      item(hollow, 20.25, 3, 'playing'),
      item(stardew, null, null, 'backlog'),
    ]);
    expect(s.gameCount).toBe(3);
    expect(s.totalHours).toBe(35.3);
    expect(s.statusCounts).toEqual({ playing: 1, finished: 1, dropped: 0, backlog: 1, paused: 0 });
  });

  it('finds the most played game with its art', () => {
    const s = run([item(hades, 10, 1), item(hollow, 80, 3)], {
      2: { coverUrl: 'c2', coverUrlSmall: 's2', accent: '#112233' },
    });
    expect(s.mostPlayed).toEqual({
      igdbId: 2,
      name: 'Hollow Knight',
      hours: 80,
      coverUrl: 'c2',
      accent: '#112233',
    });
    expect(run([item(stardew, null, null, 'backlog')]).mostPlayed).toBeNull();
  });

  it('names the top five genres and themes by taste weight, genres and themes apart', () => {
    const s = run([item(hades, 100, 1), item(hollow, 50, 1), item(stardew, 5, 1)]);
    expect(s.topTastes.length).toBeLessThanOrEqual(5);
    expect(s.topTastes[0]).toMatchObject({ kind: 'genre', name: expect.any(String) });
    const weights = s.topTastes.map((t) => t.weight);
    expect(weights).toEqual([...weights].sort((a, b) => b - a));
    expect(s.topTastes.every((t) => t.name.length > 0)).toBe(true);
  });

  it('taste weights reflect personal ratings', () => {
    const base = [item(hades, 10, 1), item(hollow, 10, 1)];
    const liked = run(base.map((i, n) => ({ ...i, rating: n === 1 ? 5 : 2 })));
    const names = (s: ReturnType<typeof run>) => s.topTastes.map((t) => t.name);
    expect(names(liked)[0]).toBe('Platform');
    const flipped = run(base.map((i, n) => ({ ...i, rating: n === 0 ? 5 : 2 })));
    expect(names(flipped)[0]).not.toBe('Platform');
  });

  it('counts a game on two platforms once, as the merged library does', () => {
    const [a, b, c, d] = [
      game(11, 'A', {}, { genres: [4] }),
      game(12, 'B', {}, { genres: [5] }),
      game(13, 'C', {}, { genres: [9] }),
      game(14, 'D', {}, { genres: [10] }),
    ];
    const others = [item(b, 10, 2), item(c, 10, 3), item(d, 10, 4)];
    const split = run([on(item(a, 5, 1), 'pc'), on(item(a, 5, 1), 'ps5'), ...others]);
    const single = run([item(a, 10, 1), ...others]);
    expect(split.topTastes).toEqual(single.topTastes);
    expect(split.covers).toEqual(single.covers);
  });

  it('lets only owned games shape the top tastes', () => {
    const racer = game(15, 'Racer', {}, { genres: [10] });
    const s = run([item(hollow, 5, 1), item(racer, 500, 1, 'playing', false)]);
    expect(s.topTastes.map((t) => t.name)).not.toContain('Racing');
  });

  it('scales genres and themes together, so a weak theme is not the top', () => {
    const genreOnly = game(16, 'G', {}, { genres: [8] });
    const themeOnly = game(17, 'T', {}, { themes: [33] });
    const s = run([item(genreOnly, 100, 1), item(themeOnly, 5, 1)]);
    const weight = (name: string) => s.topTastes.find((t) => t.name === name)?.weight;
    expect(weight('Platform')).toBe(1);
    expect(weight('Sandbox')).toBeLessThan(0.5);
  });

  it('derives the playstyle from the top vocab tags', () => {
    const s = run([item(hollow, 50, 1)]);
    expect(s.playstyle).toEqual({
      label: 'Metroidvania explorer',
      tags: ['Metroidvania', 'Exploration'],
    });
  });

  it('splits games by platform as shares of one', () => {
    const s = run([
      on(item(hades, 1, 1), 'pc'),
      on(item(hollow, 1, 1), 'pc'),
      on(item(stardew, 1, 1), 'switch'),
      on(item(stardew, 1, 1), 'switch'),
    ]);
    expect(s.platforms.map((p) => [p.platform, p.games])).toEqual([
      ['pc', 2],
      ['switch', 1],
    ]);
    expect(s.platforms[0]?.share).toBeCloseTo(2 / 3);
    expect(s.platforms.reduce((a, p) => a + p.share, 0)).toBeCloseTo(1);
  });

  it('lists top-rated games (4+), best first; none when nothing is rated that high', () => {
    const s = run([
      { ...item(hades, 10, 1), rating: 4 },
      { ...item(hollow, 5, 1), rating: 5 },
      { ...item(stardew, 50, 1), rating: 3 },
    ]);
    expect(s.topRated.map((g) => [g.name, g.rating])).toEqual([
      ['Hollow Knight', 5],
      ['Hades', 4],
    ]);
    expect(run([item(hades, 10, 1)]).topRated).toEqual([]);
  });

  it('builds a cover collage from the heaviest games that have covers', () => {
    const s = run([item(hades, 100, 1), item(hollow, 50, 1), item(stardew, 5, 1)], {
      1: { coverUrl: 'c1', coverUrlSmall: null, accent: null },
      3: { coverUrl: 'c3', coverUrlSmall: null, accent: null },
    });
    expect(s.covers.map((c) => c.igdbId)).toEqual([1, 3]);
  });

  it('only counts owned games toward hours, statuses and platforms', () => {
    const s = run([item(hades, 10, 1), item(hollow, 99, 1, 'backlog', false)]);
    expect(s.gameCount).toBe(1);
    expect(s.totalHours).toBe(10);
  });

  it('matches its schema', () => {
    const s = run([on(item(hades, 10, 1), 'pc'), item(hollow, 5, 3, 'playing')]);
    expect(tasteSummarySchema.safeParse(s).success).toBe(true);
  });
});
