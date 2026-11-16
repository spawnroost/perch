import type { FeedbackItem, LibraryItem } from './types.js';

export const BACKLOG_MAX_HOURS = 2;

/** Owned and barely played (null hours count as 0): still worth recommending, whatever the status. */
export function isBacklog(item: LibraryItem): boolean {
  return item.owned && (item.hours ?? 0) < BACKLOG_MAX_HOURS;
}

/**
 * Ids never to recommend: library games that are not backlog, and anything the user
 * marked 'down', 'not_interested' or 'played'.
 */
export function hiddenIds(
  library: readonly LibraryItem[],
  feedback: readonly FeedbackItem[],
): Set<number> {
  const hidden = new Set<number>();
  for (const l of library) if (!isBacklog(l)) hidden.add(l.game.igdbId);
  for (const f of feedback) {
    if (f.kind !== 'up') hidden.add(f.igdbId);
  }
  return hidden;
}
