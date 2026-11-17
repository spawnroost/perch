/** Rows whose fit is requested at once; the list shows no more than this. */
export const FIT_REQUEST_LIMIT = 8;

export interface ShortcutEvent {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  repeat: boolean;
  isComposing: boolean;
  target: object | null;
}

const TEXT_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

function isTyping(target: ShortcutEvent['target']): boolean {
  const el = target as { tagName?: string; isContentEditable?: boolean } | null;
  return !!el && (TEXT_TAGS.has(el.tagName ?? '') || el.isContentEditable === true);
}

/**
 * Whether a keydown opens global search: `/` (never while typing in a field) or Ctrl/Cmd+K
 * (works from a field too, as it types nothing).
 */
export function isSearchShortcut(e: ShortcutEvent): boolean {
  if (e.repeat || e.isComposing || e.altKey) return false;
  if (e.key === '/') return !e.ctrlKey && !e.metaKey && !isTyping(e.target);
  return e.key.toLowerCase() === 'k' && (e.ctrlKey || e.metaKey) && !e.shiftKey;
}

/** Active row after a navigation key; arrows wrap, Home/End jump, other keys keep it. -1 means none. */
export function moveActive(index: number, key: string, count: number): number {
  if (count <= 0) return -1;
  switch (key) {
    case 'ArrowDown':
      return index < 0 ? 0 : (index + 1) % count;
    case 'ArrowUp':
      return index < 0 ? count - 1 : (index - 1 + count) % count;
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return index;
  }
}

/** Rows the list shows, and so the only games whose fit is requested. */
export function visibleResults<T>(
  results: readonly T[] | undefined,
  limit = FIT_REQUEST_LIMIT,
): T[] {
  return (results ?? []).slice(0, limit);
}

/** DOM id of a result option, for `aria-activedescendant`. */
export function optionId(prefix: string, igdbId: number): string {
  return `${prefix}-option-${igdbId}`;
}
