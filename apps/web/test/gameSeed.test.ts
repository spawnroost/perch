import { describe, expect, it } from 'vitest';
import type { LibraryEntry, RecommendationsResponse } from '@perch/core';
import { seedGameDetail } from '@/lib/gameSeed';

const rec = {
  rank: 1,
  score: 1,
  backlog: false,
  reason: 'r',
  game: {
    igdbId: 7,
    name: 'Hades',
    coverUrl: 'c',
    coverUrlSmall: 'cs',
    heroUrl: 'h',
    accent: '#112233',
    firstRelease: '2020-09-17',
    rating: 93.4,
  },
  fits: [{ deviceId: 'd1', deviceName: 'Deck', status: 'yes', reason: 'ok' }],
  deck: 'verified',
  timeToBeat: { hastilyHours: 1, normallyHours: 2, completelyHours: 3, submissions: 9 },
} as unknown as RecommendationsResponse['recommendations'][number];

const entry = {
  igdbId: 9,
  name: 'Celeste',
  coverUrl: 'c9',
  coverUrlSmall: 'cs9',
  heroUrl: 'h9',
  accent: '#abcdef',
} as unknown as LibraryEntry;

describe('seedGameDetail', () => {
  it('seeds from a recommendation, keeping its fit, deck and time to beat', () => {
    const seed = seedGameDetail(7, [[rec]], [entry]);
    expect(seed?.game).toMatchObject({
      igdbId: 7,
      name: 'Hades',
      coverUrl: 'c',
      coverUrlSmall: 'cs',
      heroUrl: 'h',
      accent: '#112233',
      rating: 93.4,
      firstRelease: '2020-09-17',
      summary: null,
    });
    expect(seed?.fit).toEqual(rec.fits);
    expect(seed?.deck).toBe('verified');
    expect(seed?.timeToBeat).toEqual(rec.timeToBeat);
  });

  it('falls back to a library entry with the art only', () => {
    const seed = seedGameDetail(9, [[rec]], [entry]);
    expect(seed?.game).toMatchObject({
      igdbId: 9,
      name: 'Celeste',
      heroUrl: 'h9',
      accent: '#abcdef',
    });
    expect(seed?.fit).toEqual([]);
    expect(seed?.why).toEqual([]);
  });

  it('returns undefined when the game is in neither cache, or the caches are empty', () => {
    expect(seedGameDetail(1, [[rec]], [entry])).toBeUndefined();
    expect(seedGameDetail(1, [], undefined)).toBeUndefined();
    expect(seedGameDetail(1, [undefined], undefined)).toBeUndefined();
  });
});
