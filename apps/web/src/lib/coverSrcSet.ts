/** IGDB cover_small and cover_big widths in px. */
export const COVER_SMALL_WIDTH = 90;
export const COVER_FULL_WIDTH = 264;

export type CoverImage = { src: string; srcSet: string | undefined };

/** img src and srcset from the two cover sizes; null when the game has no art. */
export function coverImage(
  full: string | null | undefined,
  small: string | null | undefined,
): CoverImage | null {
  const src = full || small;
  if (!src) return null;
  const srcSet =
    full && small && full !== small
      ? `${small} ${COVER_SMALL_WIDTH}w, ${full} ${COVER_FULL_WIDTH}w`
      : undefined;
  return { src, srcSet };
}
