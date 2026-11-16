import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import type { RecommendationsResponse } from '@perch/core';
import {
  applyFeedback,
  dropRecommendation,
  removesFromPicks,
  restoreFeedback,
} from '../src/lib/feedback.js';
import { queryKeys } from '../src/lib/queryKeys.js';

const pick = (igdbId: number) => ({
  rank: igdbId,
  score: 1,
  backlog: false,
  reason: 'r',
  game: { igdbId, name: `g${igdbId}`, firstRelease: null, rating: null },
});
const list = (...ids: number[]): RecommendationsResponse => ({
  recommendations: ids.map(pick),
});

describe('removesFromPicks', () => {
  it('drops a game from the lists unless it was only liked', () => {
    expect(removesFromPicks('up')).toBe(false);
    for (const kind of ['down', 'played', 'not_interested'] as const) {
      expect(removesFromPicks(kind)).toBe(true);
    }
  });
});

describe('dropRecommendation', () => {
  it('removes one game and tolerates missing data', () => {
    expect(dropRecommendation(list(1, 2, 3), 2)?.recommendations.map((r) => r.game.igdbId)).toEqual(
      [1, 3],
    );
    expect(dropRecommendation(undefined, 2)).toBeUndefined();
  });
});

describe('applyFeedback / restoreFeedback', () => {
  function setup() {
    const qc = new QueryClient();
    qc.setQueryData(queryKeys.recommendations('all', 20), list(1, 2, 3));
    qc.setQueryData(queryKeys.recommendations('pc-1', 20), list(2, 4));
    return qc;
  }
  const ids = (qc: QueryClient, device: string) =>
    qc
      .getQueryData<RecommendationsResponse>(queryKeys.recommendations(device, 20))
      ?.recommendations.map((r) => r.game.igdbId);

  it('removes the game from every cached pick list and records the feedback', async () => {
    const qc = setup();
    await applyFeedback(qc, 2, 'not_interested');
    expect(ids(qc, 'all')).toEqual([1, 3]);
    expect(ids(qc, 'pc-1')).toEqual([4]);
    expect(qc.getQueryData(queryKeys.feedback)).toEqual({ 2: 'not_interested' });
  });

  it('keeps the lists on a like but still records it', async () => {
    const qc = setup();
    await applyFeedback(qc, 2, 'up');
    expect(ids(qc, 'all')).toEqual([1, 2, 3]);
    expect(qc.getQueryData(queryKeys.feedback)).toEqual({ 2: 'up' });
  });

  it('restores lists and feedback from the snapshot on error', async () => {
    const qc = setup();
    await applyFeedback(qc, 1, 'up');
    const snapshot = await applyFeedback(qc, 2, 'played');
    restoreFeedback(qc, snapshot);
    expect(ids(qc, 'all')).toEqual([1, 2, 3]);
    expect(ids(qc, 'pc-1')).toEqual([2, 4]);
    expect(qc.getQueryData(queryKeys.feedback)).toEqual({ 1: 'up' });
  });
});
