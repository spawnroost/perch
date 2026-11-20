import { describe, expect, it } from 'vitest';
import { buildReasonItems, REASON_TOP_N, type RecommendationsResponse } from '../../src/index.js';

type Rec = RecommendationsResponse['recommendations'][number];

function rec(id: number, over: Partial<Rec> = {}): Rec {
  return {
    rank: id,
    score: 1,
    backlog: false,
    reason: 'Matches your overall taste profile',
    sourceGame: null,
    game: {
      igdbId: id,
      name: `Game ${id}`,
      coverUrl: null,
      coverUrlSmall: null,
      heroUrl: null,
      accent: null,
      firstRelease: null,
      rating: null,
    },
    fits: [],
    deck: null,
    timeToBeat: null,
    ...over,
  } as Rec;
}

describe('buildReasonItems', () => {
  it('takes the closest game and the shared tags carried on the rec', () => {
    const [item] = buildReasonItems([
      rec(1, {
        sourceGame: { igdbId: 9, name: 'Dead Cells' },
        sharedTags: ['Roguelike', 'Action', 'Pixel art'],
      }),
    ]);
    expect(item).toEqual({
      igdbId: 1,
      name: 'Game 1',
      closestLibraryGames: ['Dead Cells'],
      sharedTags: ['Roguelike', 'Action', 'Pixel art'],
    });
  });

  it('has no library game or tags for a generic pick', () => {
    const [item] = buildReasonItems([rec(1)]);
    expect(item!.closestLibraryGames).toEqual([]);
    expect(item!.sharedTags).toEqual([]);
  });

  it('does not read tags out of the reason text', () => {
    const [item] = buildReasonItems([
      rec(1, { sourceGame: { igdbId: 9, name: 'A' }, reason: 'Similar to A: a, b' }),
    ]);
    expect(item!.sharedTags).toEqual([]);
  });

  it('caps at the top 20 and at 3 tags, and adds a fit hint only for yellow', () => {
    const recs = Array.from({ length: 25 }, (_, i) => rec(i + 1));
    expect(buildReasonItems(recs)).toHaveLength(REASON_TOP_N);
    const [item] = buildReasonItems([
      rec(1, {
        sourceGame: { igdbId: 9, name: 'A' },
        sharedTags: ['a', 'b', 'c', 'd'],
        fit: { status: 'yellow', deviceId: 'd' },
      }),
    ]);
    expect(item!.sharedTags).toEqual(['a', 'b', 'c']);
    expect(item!.fit).toMatch(/low settings/i);
  });
});
