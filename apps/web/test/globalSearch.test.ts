import { describe, expect, it } from 'vitest';
import {
  FIT_REQUEST_LIMIT,
  isSearchShortcut,
  moveActive,
  optionId,
  visibleResults,
} from '@/lib/globalSearch';

const key = (init: Partial<Parameters<typeof isSearchShortcut>[0]>) => ({
  key: '',
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  repeat: false,
  isComposing: false,
  target: null,
  ...init,
});

describe('isSearchShortcut', () => {
  it('opens on / outside inputs', () => {
    expect(isSearchShortcut(key({ key: '/' }))).toBe(true);
  });

  it('ignores / while typing in an input, textarea, select or contenteditable', () => {
    for (const tag of ['INPUT', 'TEXTAREA', 'SELECT']) {
      expect(isSearchShortcut(key({ key: '/', target: { tagName: tag } }))).toBe(false);
    }
    expect(
      isSearchShortcut(key({ key: '/', target: { tagName: 'DIV', isContentEditable: true } })),
    ).toBe(false);
    expect(isSearchShortcut(key({ key: '/', target: { tagName: 'BUTTON' } }))).toBe(true);
  });

  it('opens on Ctrl+K and Cmd+K, even from an input', () => {
    expect(isSearchShortcut(key({ key: 'k', ctrlKey: true }))).toBe(true);
    expect(isSearchShortcut(key({ key: 'K', metaKey: true }))).toBe(true);
    expect(isSearchShortcut(key({ key: 'k', ctrlKey: true, target: { tagName: 'INPUT' } }))).toBe(
      true,
    );
  });

  it('ignores plain k, other modifiers, repeats and IME composition', () => {
    expect(isSearchShortcut(key({ key: 'k' }))).toBe(false);
    expect(isSearchShortcut(key({ key: '/', ctrlKey: true }))).toBe(false);
    expect(isSearchShortcut(key({ key: '/', altKey: true }))).toBe(false);
    expect(isSearchShortcut(key({ key: 'k', ctrlKey: true, shiftKey: true }))).toBe(false);
    expect(isSearchShortcut(key({ key: '/', repeat: true }))).toBe(false);
    expect(isSearchShortcut(key({ key: '/', isComposing: true }))).toBe(false);
  });
});

describe('moveActive', () => {
  it('wraps with arrows', () => {
    expect(moveActive(0, 'ArrowDown', 3)).toBe(1);
    expect(moveActive(2, 'ArrowDown', 3)).toBe(0);
    expect(moveActive(0, 'ArrowUp', 3)).toBe(2);
  });

  it('starts at the first or last row from no selection', () => {
    expect(moveActive(-1, 'ArrowDown', 3)).toBe(0);
    expect(moveActive(-1, 'ArrowUp', 3)).toBe(2);
  });

  it('jumps with Home and End', () => {
    expect(moveActive(1, 'Home', 4)).toBe(0);
    expect(moveActive(1, 'End', 4)).toBe(3);
  });

  it('returns -1 with no rows and leaves other keys alone', () => {
    expect(moveActive(0, 'ArrowDown', 0)).toBe(-1);
    expect(moveActive(1, 'a', 3)).toBe(1);
  });
});

describe('visibleResults', () => {
  const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ igdbId: i + 1 }));

  it('caps the rows shown, and so the fit requests, at the limit', () => {
    expect(FIT_REQUEST_LIMIT).toBe(8);
    expect(visibleResults(rows(20))).toHaveLength(8);
    expect(visibleResults(rows(20))[7]).toEqual({ igdbId: 8 });
    expect(visibleResults(rows(3))).toHaveLength(3);
    expect(visibleResults(undefined)).toEqual([]);
  });
});

describe('optionId', () => {
  it('namespaces a game id', () => {
    expect(optionId('gs', 42)).toBe('gs-option-42');
  });
});
