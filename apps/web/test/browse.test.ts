import { describe, expect, it } from 'vitest';
import {
  BROWSE_LIMIT,
  browsePath,
  browseSelection,
  hasFilters,
  nextOffset,
  toggleId,
  withToggled,
} from '../src/lib/browse.js';
import { queryKeys } from '../src/lib/queryKeys.js';

const sp = (s: string) => new URLSearchParams(s);

describe('browseSelection', () => {
  it('reads genres, themes and device from the URL', () => {
    expect(browseSelection(sp('genres=12,31&themes=17&device=abc'))).toEqual({
      genres: [12, 31],
      themes: [17],
      device: 'abc',
    });
  });
  it('defaults to nothing selected on All, and drops bad or repeated ids', () => {
    expect(browseSelection(sp(''))).toEqual({ genres: [], themes: [], device: 'all' });
    expect(browseSelection(sp('genres=x,0,-1,5,5,2.5&themes='))).toEqual({
      genres: [5],
      themes: [],
      device: 'all',
    });
  });
});

describe('toggleId', () => {
  it('adds a missing id and removes a present one, keeping ids sorted', () => {
    expect(toggleId([3, 1], 2)).toEqual([1, 2, 3]);
    expect(toggleId([1, 2, 3], 2)).toEqual([1, 3]);
    expect(toggleId([], 4)).toEqual([4]);
  });
});

describe('browsePath / withToggled', () => {
  it('writes only what is set; the device rides along unless it is All', () => {
    expect(browsePath({ genres: [], themes: [], device: 'all' })).toBe('/browse');
    expect(browsePath({ genres: [12, 31], themes: [17], device: 'all' })).toBe(
      '/browse?genres=12,31&themes=17',
    );
    expect(browsePath({ genres: [], themes: [17], device: 'd 1' })).toBe(
      '/browse?themes=17&device=d%201',
    );
  });
  it('toggles a genre or a theme without touching the other group', () => {
    const sel = { genres: [12], themes: [17], device: 'x' };
    expect(withToggled(sel, 'genres', 31)).toEqual({ genres: [12, 31], themes: [17], device: 'x' });
    expect(withToggled(sel, 'themes', 17)).toEqual({ genres: [12], themes: [], device: 'x' });
  });
  it('hasFilters is true when any chip is on', () => {
    expect(hasFilters({ genres: [], themes: [], device: 'all' })).toBe(false);
    expect(hasFilters({ genres: [], themes: [1], device: 'all' })).toBe(true);
  });
});

describe('nextOffset', () => {
  it('is the number of games loaded while the last page says there is more', () => {
    const page = (n: number, hasMore: boolean) => ({
      recommendations: Array.from({ length: n }, () => ({})),
      hasMore,
    });
    expect(nextOffset(page(BROWSE_LIMIT, true), [page(BROWSE_LIMIT, true)])).toBe(BROWSE_LIMIT);
    expect(nextOffset(page(5, true), [page(BROWSE_LIMIT, true), page(5, true)])).toBe(
      BROWSE_LIMIT + 5,
    );
    expect(nextOffset(page(5, false), [page(BROWSE_LIMIT, true), page(5, false)])).toBeUndefined();
  });
});

describe('queryKeys.browse', () => {
  it('has its own root, so recommendation refreshes leave it alone', () => {
    const key = queryKeys.browse([1], [2], 'all');
    expect(key.slice(0, queryKeys.browseAll.length)).toEqual(queryKeys.browseAll);
    expect(key[0]).toBe('browse');
  });
});
