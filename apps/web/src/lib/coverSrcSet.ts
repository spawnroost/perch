/** IGDB t_cover_big and t_cover_big_2x widths in px. */
export const COVER_FULL_WIDTH = 264;
export const COVER_2X_WIDTH = 528;

const FULL_SIZE = '/t_cover_big/';
const FULL_2X_SIZE = '/t_cover_big_2x/';

export type CoverImage = { src: string; srcSet: string | undefined };

/**
 * img src and srcset for a game cover; null when the game has no art. The srcset pairs the 264w cover
 * with its 528w 2x variant (the small 90w thumbnail is far below card width, so it is only a src fallback).
 */
export function coverImage(
  full: string | null | undefined,
  small: string | null | undefined,
): CoverImage | null {
  const src = full || small;
  if (!src) return null;
  const srcSet = full?.includes(FULL_SIZE)
    ? `${full} ${COVER_FULL_WIDTH}w, ${full.replace(FULL_SIZE, FULL_2X_SIZE)} ${COVER_2X_WIDTH}w`
    : undefined;
  return { src, srcSet };
}
