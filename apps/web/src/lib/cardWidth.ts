/** Default GameCard width (shelf cards); COVER_SIZES in GameCard must describe the same widths. */
export const CARD_WIDTH = 'w-40 lg:w-56';

// A width utility: `w-…` with any variants in front, but not max-w / min-w.
const WIDTH_CLASS = /(^|\s)(?:[\w-]+:)*w-/;

/** The default card width, or none when the caller sets one (twMerge would keep lg:w-56 otherwise). */
export function withCardWidth(className: string | undefined): string {
  return className && WIDTH_CLASS.test(className) ? '' : CARD_WIDTH;
}

/** Responsive cover grid for pages of full-width cards (library, See all). */
export const CARD_GRID =
  'grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6';
/** img sizes hint matching CARD_GRID's column widths. */
export const CARD_GRID_SIZES =
  '(min-width: 1280px) 15rem, (min-width: 1024px) 18rem, (min-width: 640px) 14rem, 10rem';
