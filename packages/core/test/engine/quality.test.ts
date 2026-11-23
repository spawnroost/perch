import { describe, expect, it } from 'vitest';
import { IGDB_PLATFORM as P } from '../../src/devices/presets.js';
import {
  F2P_KEYWORDS,
  F2P_SLUGS,
  isFreeToPlay,
  isMobileOnly,
  meetsQualityFloor,
} from '../../src/engine/quality.js';

const good = { coverUrl: 'c', ratingCount: 20, gameType: 0 };

describe('isMobileOnly', () => {
  it('is true when every platform is iOS or Android', () => {
    expect(isMobileOnly({ platforms: [P.ios] })).toBe(true);
    expect(isMobileOnly({ platforms: [P.ios, P.android] })).toBe(true);
  });
  it('ignores Windows Phone and Windows Mobile', () => {
    expect(isMobileOnly({ platforms: [P.android, 74, 405] })).toBe(true);
  });
  it('is false with any other platform, none, or only ignored ones', () => {
    expect(isMobileOnly({ platforms: [P.ios, P.windows] })).toBe(false);
    expect(isMobileOnly({ platforms: [] })).toBe(false);
    expect(isMobileOnly({})).toBe(false);
    expect(isMobileOnly({ platforms: [74, 405] })).toBe(false);
  });
});

describe('meetsQualityFloor', () => {
  it('mobile-only needs a cover, 20+ ratings and game_type 0', () => {
    const g = { platforms: [P.ios], ...good };
    expect(meetsQualityFloor(g)).toBe(true);
    expect(meetsQualityFloor({ ...g, coverUrl: null })).toBe(false);
    expect(meetsQualityFloor({ ...g, coverUrl: undefined })).toBe(false);
    expect(meetsQualityFloor({ ...g, ratingCount: 19 })).toBe(false);
    expect(meetsQualityFloor({ ...g, ratingCount: null })).toBe(false);
    expect(meetsQualityFloor({ ...g, gameType: 1 })).toBe(false);
    expect(meetsQualityFloor({ ...g, gameType: null })).toBe(true); // cached before game_type existed
  });
  it('games also on other platforms keep the existing floor (always passes here)', () => {
    expect(meetsQualityFloor({ platforms: [P.ios, P.windows] })).toBe(true);
    expect(meetsQualityFloor({ platforms: [P.switch], ratingCount: 0 })).toBe(true);
    expect(meetsQualityFloor({})).toBe(true);
  });
});

describe('isFreeToPlay', () => {
  it('is true for each F2P/gacha keyword', () => {
    expect([...F2P_KEYWORDS].sort((a, b) => a - b)).toEqual([2385, 4358, 4400, 23778, 25210]);
    for (const k of F2P_KEYWORDS) expect(isFreeToPlay({ keywords: [1, k, 2] })).toBe(true);
  });
  it('is true for a curated slug without keywords', () => {
    expect(F2P_SLUGS.has('clash-royale')).toBe(true);
    expect(F2P_SLUGS.has('among-us')).toBe(false);
    expect(isFreeToPlay({ slug: 'clash-royale', keywords: [] })).toBe(true);
    expect(isFreeToPlay({ slug: 'candy-crush-saga' })).toBe(true);
  });
  it('is false for other keywords, other slugs, or no data', () => {
    expect(isFreeToPlay({ slug: 'hades', keywords: [1, 2, 3] })).toBe(false);
    expect(isFreeToPlay({})).toBe(false);
    expect(isFreeToPlay({ slug: null, keywords: null })).toBe(false);
  });
});
