import { describe, expect, test } from 'vitest';
import {
  GENRE_MAP,
  KEYWORD_MAP,
  THEME_MAP,
  VOCAB,
  findUnmapped,
  formatUnmappedReport,
  mapGame,
  type VocabId,
} from '../src/index.js';

const ids = new Set<string>(VOCAB.map((v) => v.id));

describe('vocab', () => {
  test('ids are unique, kinds valid, ~40 entries', () => {
    expect(ids.size).toBe(VOCAB.length);
    expect(VOCAB.length).toBeGreaterThanOrEqual(38);
    for (const v of VOCAB) {
      expect(['mood', 'theme', 'pacing', 'form']).toContain(v.kind);
      expect(v.label.length).toBeGreaterThan(0);
    }
  });

  test.each([
    ['genres', GENRE_MAP],
    ['themes', THEME_MAP],
    ['keywords', KEYWORD_MAP],
  ] as const)('every %s map target is a valid VocabId with weight in (0,1]', (_n, table) => {
    for (const [igdbId, targets] of Object.entries(table)) {
      expect(Number.isInteger(Number(igdbId))).toBe(true);
      for (const [vocabId, w] of Object.entries(targets)) {
        expect(ids.has(vocabId), `${igdbId} -> ${vocabId}`).toBe(true);
        expect(w).toBeGreaterThan(0);
        expect(w).toBeLessThanOrEqual(1);
      }
    }
  });

  test('keyword table is curated (~50-100) and genre/theme tables are complete', () => {
    expect(Object.keys(KEYWORD_MAP).length).toBeGreaterThanOrEqual(50);
    expect(Object.keys(KEYWORD_MAP).length).toBeLessThanOrEqual(100);
    expect(Object.keys(GENRE_MAP).length).toBe(23);
    expect(Object.keys(THEME_MAP).length).toBe(22);
  });
});

describe('mapGame', () => {
  const hades = { genres: [25, 12, 32], themes: [1, 17], keywords: [416, 578, 953, 35] };

  test('Hades-like set yields mythology, roguelike, fast-paced high', () => {
    const v = mapGame(hades);
    expect(v.mythology).toBeGreaterThanOrEqual(0.6);
    expect(v.roguelike).toBeGreaterThanOrEqual(0.6);
    expect(v['fast-paced']).toBeGreaterThanOrEqual(0.6);
    expect(v.cozy).toBe(0);
  });

  test('normalised: all values in [0,1], max is exactly 1, every VocabId present', () => {
    const v = mapGame(hades);
    const vals = Object.values(v);
    expect(Math.max(...vals)).toBe(1);
    expect(Math.min(...vals)).toBeGreaterThanOrEqual(0);
    expect(Object.keys(v).sort()).toEqual([...ids].sort());
  });

  test('unknown ids ignored; empty input is all zeros', () => {
    const v = mapGame({ genres: [999999], themes: [], keywords: [-1] });
    expect(Object.values(v).every((x) => x === 0)).toBe(true);
    expect(mapGame({ genres: [], themes: [], keywords: [] })).toEqual(v);
  });

  test('weights from several ids sum before normalising', () => {
    const one = mapGame({ genres: [], themes: [], keywords: [416] });
    expect(one.roguelike).toBe(1);
    const both = mapGame({ genres: [], themes: [], keywords: [416, 953] });
    expect(both.roguelike).toBe(both.mythology);
  });
});

describe('findUnmapped', () => {
  test('counts unmapped ids, sorted by count desc, ignores mapped and nulls', () => {
    const r = findUnmapped([
      { genres: [32 + 1000, 12], themes: [9001], keywords: [8888, 7777, 416] },
      { genres: [1032], themes: null, keywords: [8888] },
      { genres: null, themes: [9001, 9002], keywords: [8888, 7777] },
    ]);
    expect(r.genres).toEqual([{ id: 1032, count: 2 }]);
    expect(r.themes).toEqual([
      { id: 9001, count: 2 },
      { id: 9002, count: 1 },
    ]);
    expect(r.keywords).toEqual([
      { id: 8888, count: 3 },
      { id: 7777, count: 2 },
    ]);
  });

  test('a repeated id within one game counts once', () => {
    expect(findUnmapped([{ genres: [], themes: [], keywords: [5555, 5555] }]).keywords).toEqual([
      { id: 5555, count: 1 },
    ]);
  });

  test('report formatting limits keywords', () => {
    const keywords = Array.from({ length: 50 }, (_, i) => ({ id: 60000 + i, count: 50 - i }));
    const out = formatUnmappedReport({ genres: [], themes: [], keywords }, { topKeywords: 30 });
    expect(out).toContain('60000');
    expect(out).toContain('60029');
    expect(out).not.toContain('60030');
  });
});

test('VocabId type is usable', () => {
  const id: VocabId = 'dark';
  expect(ids.has(id)).toBe(true);
});
