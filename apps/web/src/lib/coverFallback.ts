const MAX_LABEL = 60;

/** Whether to draw the image: it needs a src that has not already failed to load. */
export function showsImage(
  src: string | null | undefined,
  failedSrc: string | null,
): src is string {
  return Boolean(src) && src !== failedSrc;
}

/** Title text for the cover placeholder: whitespace collapsed, long titles cut with an ellipsis. */
export function coverFallbackLabel(label: string | null | undefined): string {
  const text = (label ?? '').replace(/\s+/g, ' ').trim();
  return text.length > MAX_LABEL ? `${text.slice(0, MAX_LABEL - 1).trimEnd()}…` : text;
}
