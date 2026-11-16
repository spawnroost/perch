import type { FeedbackItem, LibraryItem } from './types.js';

export const BACKLOG_MAX_HOURS = 2;

/** Owned and either marked backlog or barely played: still worth recommending. */
export function isBacklog(item: LibraryItem): boolean {
  return item.owned && (item.status === 'backlog' || (item.hours ?? 0) < BACKLOG_MAX_HOURS);
}

/**
 * Ids never to recommend: library games that are not backlog, and anything the user
 * marked 'down' or 'not_interested'.
 */
export function hiddenIds(
  library: readonly LibraryItem[],
  feedback: readonly FeedbackItem[],
): Set<number> {
  const hidden = new Set<number>();
  for (const l of library) if (!isBacklog(l)) hidden.add(l.game.igdbId);
  for (const f of feedback) {
    if (f.kind === 'down' || f.kind === 'not_interested') hidden.add(f.igdbId);
  }
  return hidden;
}
