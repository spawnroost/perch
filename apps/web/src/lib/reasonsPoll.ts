export const REASONS_POLL_MS = 2000;
export const REASONS_MAX_POLLS = 5;

/**
 * Decides when to ask the For you feed again while the server writes the AI reasons. The limit
 * counts responses since the last one without pending reasons, not the query's lifetime updates.
 */
export function createReasonsPoller() {
  const settledAt = new WeakMap<object, number>();
  return (query: object, pending: boolean, updateCount: number): number | false => {
    if (!pending) {
      settledAt.set(query, updateCount);
      return false;
    }
    // A query never seen settled: this is its first pending response.
    const base = settledAt.get(query) ?? updateCount - 1;
    settledAt.set(query, base);
    return updateCount - base < REASONS_MAX_POLLS ? REASONS_POLL_MS : false;
  };
}
