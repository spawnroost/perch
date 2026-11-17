import { describe, expect, it } from 'vitest';
import {
  FIT_REQUEST_LIMIT,
  isSearchShortcut,
  modalDialogOpen,
  moveActive,
  optionId,
  searchResultLabel,
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

  it('opens on Ctrl+K and Cmd+K outside text fields', () => {
    expect(isSearchShortcut(key({ key: 'k', ctrlKey: true }))).toBe(true);
    expect(isSearchShortcut(key({ key: 'K', metaKey: true }))).toBe(true);
    expect(isSearchShortcut(key({ key: 'k', ctrlKey: true, target: { tagName: 'BUTTON' } }))).toBe(
      true,
    );
  });

  it('ignores Ctrl/Cmd+K while typing in a field, like /', () => {
    expect(isSearchShortcut(key({ key: 'k', ctrlKey: true, target: { tagName: 'INPUT' } }))).toBe(
      false,
    );
    expect(
      isSearchShortcut(key({ key: 'k', metaKey: true, target: { tagName: 'TEXTAREA' } })),
    ).toBe(false);
    expect(
      isSearchShortcut(
        key({ key: 'k', ctrlKey: true, target: { tagName: 'DIV', isContentEditable: true } }),
      ),
    ).toBe(false);
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
    expect(visibleResults(rows(20))?.[7]).toEqual({ igdbId: 8 });
    expect(visibleResults(rows(3))).toHaveLength(3);
    expect(visibleResults([])).toEqual([]);
  });
});

describe('visibleResults before the first response', () => {
  it('stays undefined, so it never reads as an empty result', () => {
    expect(visibleResults(undefined)).toBeUndefined();
  });
});

describe('modalDialogOpen', () => {
  it('looks for an open dialog', () => {
    const seen: string[] = [];
    const doc = (hit: object | null) => ({
      querySelector: (sel: string) => {
        seen.push(sel);
        return hit;
      },
    });
    expect(modalDialogOpen(doc({}))).toBe(true);
    expect(modalDialogOpen(doc(null))).toBe(false);
    expect(seen[0]).toBe('[role="dialog"][data-state="open"]');
  });
});

describe('searchResultLabel', () => {
  const fit = (deviceName: string, status: 'green' | 'yellow' | 'hidden' | 'unknown') => ({
    deviceId: deviceName,
    deviceName,
    status,
    reason: '',
  });

  it('puts the per-device fit in the name', () => {
    expect(searchResultLabel('Hades', [fit('Steam Deck', 'green'), fit('Low PC', 'yellow')])).toBe(
      'Hades \u2014 Steam Deck: runs, Low PC: may struggle',
    );
  });

  it('speaks every status', () => {
    expect(searchResultLabel('G', [fit('A', 'hidden'), fit('B', 'unknown')])).toBe(
      "G \u2014 A: won't run, B: unknown",
    );
  });

  it('adds the Steam Deck category when known', () => {
    expect(searchResultLabel('Hades', [fit('PC', 'green')], 'verified')).toBe(
      'Hades \u2014 PC: runs, Deck: verified',
    );
    expect(searchResultLabel('Hades', [], 'playable')).toBe('Hades \u2014 Deck: playable');
  });

  it('is just the name with nothing known', () => {
    expect(searchResultLabel('Hades')).toBe('Hades');
    expect(searchResultLabel('Hades', [])).toBe('Hades');
  });
});

describe('optionId', () => {
  it('namespaces a game id', () => {
    expect(optionId('gs', 42)).toBe('gs-option-42');
  });
});
