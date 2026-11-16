import type { QueryClient, QueryKey } from '@tanstack/react-query';
import type { FeedbackKind, RecommendationsResponse } from '@perch/core';
import { queryKeys } from './queryKeys';

/** Feedback sent this session, by IGDB id. */
export type FeedbackMap = Readonly<Record<number, FeedbackKind>>;

export const NO_FEEDBACK: FeedbackMap = {};

/** A like keeps the game in the lists; any other feedback means "don't show it here again". */
export function removesFromPicks(kind: FeedbackKind): boolean {
  return kind !== 'up';
}

export function dropRecommendation(
  data: RecommendationsResponse | undefined,
  igdbId: number,
): RecommendationsResponse | undefined {
  if (!data) return data;
  return { recommendations: data.recommendations.filter((r) => r.game.igdbId !== igdbId) };
}

export interface FeedbackSnapshot {
  lists: [QueryKey, RecommendationsResponse | undefined][];
  feedback: FeedbackMap;
}

/** Optimistically record feedback and prune the cached pick lists; returns what to restore on error. */
export async function applyFeedback(
  qc: QueryClient,
  igdbId: number,
  kind: FeedbackKind,
): Promise<FeedbackSnapshot> {
  await qc.cancelQueries({ queryKey: queryKeys.recommendationsAll });
  const snapshot: FeedbackSnapshot = {
    lists: qc.getQueriesData<RecommendationsResponse>({ queryKey: queryKeys.recommendationsAll }),
    feedback: qc.getQueryData<FeedbackMap>(queryKeys.feedback) ?? NO_FEEDBACK,
  };
  if (removesFromPicks(kind)) {
    qc.setQueriesData<RecommendationsResponse>({ queryKey: queryKeys.recommendationsAll }, (data) =>
      dropRecommendation(data, igdbId),
    );
  }
  qc.setQueryData<FeedbackMap>(queryKeys.feedback, (prev) => ({ ...prev, [igdbId]: kind }));
  return snapshot;
}

export function restoreFeedback(qc: QueryClient, snapshot: FeedbackSnapshot): void {
  for (const [key, data] of snapshot.lists) qc.setQueryData(key, data);
  qc.setQueryData(queryKeys.feedback, snapshot.feedback);
}
