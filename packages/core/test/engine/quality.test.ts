import { describe, expect, it } from 'vitest';
import { IGDB_PLATFORM as P } from '../../src/devices/presets.js';
import { isMobileOnly, meetsQualityFloor } from '../../src/engine/quality.js';

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
    expect(meetsQualityFloor({ ...g, gameType: null })).toBe(false);
  });
  it('games also on other platforms keep the existing floor (always passes here)', () => {
    expect(meetsQualityFloor({ platforms: [P.ios, P.windows] })).toBe(true);
    expect(meetsQualityFloor({ platforms: [P.switch], ratingCount: 0 })).toBe(true);
    expect(meetsQualityFloor({})).toBe(true);
  });
});
