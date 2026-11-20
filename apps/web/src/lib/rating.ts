/** Keyboard and click rules for the 1-5 star rating; null is unrated. */
export const MAX_RATING = 5;
export const RATING_LABELS = [
  'Hated it',
  'Disliked it',
  'It was fine',
  'Liked it',
  'Loved it',
] as const;

export type Rating = number | null;

export const ratingLabel = (n: number): string => `${n} of ${MAX_RATING}: ${RATING_LABELS[n - 1]}`;

/** Clicking the current star clears the rating; any other star sets it. */
export function clickRating(current: Rating, clicked: number): Rating {
  return clicked === current ? null : clicked;
}

/**
 * The rating after a key press, or `undefined` when the key is not a rating key (leave it alone).
 * Arrows step (from unrated, right/up start at 1 and left/down at 5), Home/End jump, 1-5 set,
 * 0, Backspace and Delete clear.
 */
export function rateFromKey(current: Rating, key: string): Rating | undefined {
  if (/^[1-5]$/.test(key)) return Number(key);
  switch (key) {
    case '0':
    case 'Backspace':
    case 'Delete':
      return null;
    case 'ArrowRight':
    case 'ArrowUp':
      return current === null ? 1 : Math.min(MAX_RATING, current + 1);
    case 'ArrowLeft':
    case 'ArrowDown':
      return current === null ? MAX_RATING : Math.max(1, current - 1);
    case 'Home':
      return 1;
    case 'End':
      return MAX_RATING;
    default:
      return undefined;
  }
}

/** The star that takes the tab stop: the chosen one, else the first. */
export const tabStop = (current: Rating): number => current ?? 1;
