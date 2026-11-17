/** Default GameCard width (shelf cards); COVER_SIZES in GameCard must describe the same widths. */
export const CARD_WIDTH = 'w-40 lg:w-56';

// A width utility: `w-…` with any variants in front, but not max-w / min-w.
const WIDTH_CLASS = /(^|\s)(?:[\w-]+:)*w-/;

/** The default card width, or none when the caller sets one (twMerge would keep lg:w-56 otherwise). */
export function withCardWidth(className: string | undefined): string {
  return className && WIDTH_CLASS.test(className) ? '' : CARD_WIDTH;
}
