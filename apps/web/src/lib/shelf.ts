/** Pure helpers for the Shelf row: arrow-key focus movement, edge-fade state, scroll distance. */

/** Index to focus after a key press, or null when the key is not a shelf key. Clamps, never wraps. */
export function nextFocusIndex(current: number, key: string, count: number): number | null {
  if (count <= 0) return null;
  const last = count - 1;
  switch (key) {
    case 'ArrowRight':
      return Math.min(last, current + 1);
    case 'ArrowLeft':
      return Math.max(0, current - 1);
    case 'Home':
      return 0;
    case 'End':
      return last;
    default:
      return null;
  }
}

export type ScrollMetrics = { scrollLeft: number; scrollWidth: number; clientWidth: number };
export type EdgeFades = { start: boolean; end: boolean };

/** Sub-pixel slack so fractional scroll positions at the ends do not leave a stray fade. */
const EDGE_EPSILON = 1;

/** Which edges have more content beyond them (and so get a fade). */
export function edgeFadeState({ scrollLeft, scrollWidth, clientWidth }: ScrollMetrics): EdgeFades {
  return {
    start: scrollLeft > EDGE_EPSILON,
    end: scrollLeft + clientWidth < scrollWidth - EDGE_EPSILON,
  };
}

/** Signed scroll distance for the prev/next buttons: most of a viewport, keeping some context. */
export function scrollStep(clientWidth: number, direction: 'prev' | 'next'): number {
  const step = Math.round(clientWidth * 0.8);
  return direction === 'next' ? step : -step;
}
