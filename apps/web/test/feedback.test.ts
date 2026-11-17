import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import type { RecommendationsResponse } from '@perch/core';
import {
  applyFeedback,
  dropRecommendation,
  feedbackChange,
  removesFromPicks,
  revertFeedback,
  withFeedback,
} from '../src/lib/feedback.js';
import { queryKeys } from '../src/lib/queryKeys.js';

type Rec = RecommendationsResponse['recommendations'][number];
const pick = (igdbId: number): Rec => ({
  rank: igdbId,
  score: 1,
  backlog: false,
  reason: 'r',
  game: {
    igdbId,
    name: `g${igdbId}`,
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

describe('withFeedback / feedbackChange', () => {
  it('sets or clears one game without touching the others', () => {
    expect(withFeedback({ 1: 'up' }, 2, 'played')).toEqual({ 1: 'up', 2: 'played' });
    expect(withFeedback({ 1: 'up', 2: 'played' }, 2, undefined)).toEqual({ 1: 'up' });
  });

  it('pressing the current kind is an undo', () => {
    expect(feedbackChange({ 1: 'up' }, 1, 'up').undo).toBe(true);
    expect(feedbackChange({ 1: 'up' }, 1, 'played').undo).toBe(false);
    expect(feedbackChange({}, 1, 'up').undo).toBe(false);
  });
});

describe('applyFeedback / revertFeedback', () => {
  function setup() {
    const qc = new QueryClient();
    qc.setQueryData(queryKeys.recommendations('all', 20), list(1, 2, 3));
    qc.setQueryData(queryKeys.recommendations('pc-1', 20), list(2, 4));
    qc.setQueryData(queryKeys.feedback, {});
    return qc;
  }
  const ids = (qc: QueryClient, device: string) =>
    qc
      .getQueryData<RecommendationsResponse>(queryKeys.recommendations(device, 20))
      ?.recommendations.map((r) => r.game.igdbId);

  it('removes the game from every cached pick list and records the feedback', async () => {
    const qc = setup();
    await applyFeedback(qc, { igdbId: 2, kind: 'not_interested', undo: false });
    expect(ids(qc, 'all')).toEqual([1, 3]);
    expect(ids(qc, 'pc-1')).toEqual([4]);
    expect(qc.getQueryData(queryKeys.feedback)).toEqual({ 2: 'not_interested' });
  });

  it('keeps the lists on a like but still records it', async () => {
    const qc = setup();
    await applyFeedback(qc, { igdbId: 2, kind: 'up', undo: false });
    expect(ids(qc, 'all')).toEqual([1, 2, 3]);
    expect(qc.getQueryData(queryKeys.feedback)).toEqual({ 2: 'up' });
  });

  it('an undo clears the feedback and leaves the lists alone', async () => {
    const qc = setup();
    qc.setQueryData(queryKeys.feedback, { 2: 'not_interested' });
    const previous = await applyFeedback(qc, { igdbId: 2, kind: 'not_interested', undo: true });
    expect(previous).toBe('not_interested');
    expect(qc.getQueryData(queryKeys.feedback)).toEqual({});
    expect(ids(qc, 'all')).toEqual([1, 2, 3]);
  });

  it('a failed change reverts only its own game, so overlapping changes survive', async () => {
    const qc = setup();
    const first = { igdbId: 1, kind: 'up', undo: false } as const;
    const second = { igdbId: 2, kind: 'played', undo: false } as const;
    const prevFirst = await applyFeedback(qc, first);
    await applyFeedback(qc, second);
    revertFeedback(qc, first, prevFirst);
    expect(qc.getQueryData(queryKeys.feedback)).toEqual({ 2: 'played' });
  });

  it('does not overwrite a later change to the same game', async () => {
    const qc = setup();
    const first = { igdbId: 1, kind: 'up', undo: false } as const;
    const prev = await applyFeedback(qc, first);
    await applyFeedback(qc, { igdbId: 1, kind: 'played', undo: false });
    revertFeedback(qc, first, prev);
    expect(qc.getQueryData(queryKeys.feedback)).toEqual({ 1: 'played' });
  });
});
