import type { InfiniteData, QueryClient } from '@tanstack/react-query';
import type {
  BrowseResponse,
  FeedbackKind,
  FeedbackListResponse,
  RecommendationsResponse,
} from '@perch/core';
import { queryKeys } from './queryKeys';

/** The user's current feedback, by IGDB id (what `GET /api/feedback` returns). */
export type FeedbackMap = FeedbackListResponse['feedback'];

export const NO_FEEDBACK: FeedbackMap = {};

/** A like keeps the game in the lists; any other feedback means "don't show it here again". */
export function removesFromPicks(kind: FeedbackKind): boolean {
  return kind !== 'up';
}

export function dropRecommendation<T extends RecommendationsResponse>(
  data: T | undefined,
  igdbId: number,
): T | undefined {
  if (!data) return data;
  return { ...data, recommendations: data.recommendations.filter((r) => r.game.igdbId !== igdbId) };
}

/** Browse pages with one game taken out of each (the paging offsets stay as fetched). */
export function dropFromBrowse(
  data: InfiniteData<BrowseResponse, number> | undefined,
  igdbId: number,
): InfiniteData<BrowseResponse, number> | undefined {
  if (!data) return data;
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      recommendations: page.recommendations.filter((r) => r.game.igdbId !== igdbId),
    })),
  };
}

/** One game's feedback in the map; `undefined` clears it. */
export function withFeedback(
  map: FeedbackMap,
  igdbId: number,
  kind: FeedbackKind | undefined,
): FeedbackMap {
  const next = { ...map };
  if (kind) next[igdbId] = kind;
  else delete next[igdbId];
  return next;
}

export interface FeedbackChange {
  igdbId: number;
  kind: FeedbackKind;
  /** The kind is already set: pressing it again takes it back. */
  undo: boolean;
}

export function feedbackChange(
  map: FeedbackMap,
  igdbId: number,
  kind: FeedbackKind,
): FeedbackChange {
  return { igdbId, kind, undo: map[igdbId] === kind };
}

/** What the map holds for the game once the change has gone through. */
const resulting = ({ kind, undo }: FeedbackChange) => (undo ? undefined : kind);

/**
 * Optimistically record the change and prune the cached pick lists, touching only this game.
 * Returns the game's previous feedback, for `revertFeedback`.
 */
export async function applyFeedback(
  qc: QueryClient,
  change: FeedbackChange,
): Promise<FeedbackKind | undefined> {
  const { igdbId, kind, undo } = change;
  await Promise.all([
    qc.cancelQueries({ queryKey: queryKeys.feedback }),
    qc.cancelQueries({ queryKey: queryKeys.recommendationsAll }),
    qc.cancelQueries({ queryKey: queryKeys.browseAll }),
  ]);
  const previous = qc.getQueryData<FeedbackMap>(queryKeys.feedback)?.[igdbId];
  qc.setQueryData<FeedbackMap>(queryKeys.feedback, (map = NO_FEEDBACK) =>
    withFeedback(map, igdbId, resulting(change)),
  );
  if (!undo && removesFromPicks(kind)) {
    qc.setQueriesData<RecommendationsResponse>({ queryKey: queryKeys.recommendationsAll }, (data) =>
      dropRecommendation(data, igdbId),
    );
    // The optimistic drop is all browse needs: the server list is fixed for the page offsets.
    qc.setQueriesData<InfiniteData<BrowseResponse, number>>(
      { queryKey: queryKeys.browseAll },
      (data) => dropFromBrowse(data, igdbId),
    );
  }
  return previous;
}

/**
 * Put back this game's previous feedback after a failed change, unless a later change has since
 * replaced it. Other games, and the pick lists (refetched when the change settles), are untouched.
 */
export function revertFeedback(
  qc: QueryClient,
  change: FeedbackChange,
  previous: FeedbackKind | undefined,
): void {
  qc.setQueryData<FeedbackMap>(queryKeys.feedback, (map = NO_FEEDBACK) =>
    map[change.igdbId] === resulting(change) ? withFeedback(map, change.igdbId, previous) : map,
  );
}
