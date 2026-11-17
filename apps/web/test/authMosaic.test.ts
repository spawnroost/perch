import { describe, expect, it } from 'vitest';
import { AUTH_COVER_IDS, coverUrl, mosaicColumns } from '../src/lib/authMosaic.js';

describe('AUTH_COVER_IDS', () => {
  it('are unique IGDB image ids', () => {
    expect(new Set(AUTH_COVER_IDS).size).toBe(AUTH_COVER_IDS.length);
    for (const id of AUTH_COVER_IDS) expect(id).toMatch(/^co[a-z0-9]+$/);
  });
});

describe('coverUrl', () => {
  it('builds the public big-cover url', () => {
    expect(coverUrl('co1abc')).toBe(
      'https://images.igdb.com/igdb/image/upload/t_cover_big/co1abc.jpg',
    );
  });
});

describe('mosaicColumns', () => {
  it('gives each column consecutive, offset ids so no cover repeats within one', () => {
    expect(mosaicColumns(['a', 'b', 'c', 'd', 'e'], 2, 3)).toEqual([
      ['a', 'b', 'c'],
      ['e', 'a', 'b'],
    ]);
  });

  it('fills every column to the same length, repeating ids when short', () => {
    const cols = mosaicColumns(['a', 'b'], 3, 4);
    expect(cols).toHaveLength(3);
    for (const c of cols) expect(c).toHaveLength(4);
  });

  it('never repeats a cover within a column or beside itself in the real layout', () => {
    const cols = mosaicColumns(AUTH_COVER_IDS, 6, 4);
    for (const c of cols) expect(new Set(c).size).toBe(c.length);
    for (let i = 1; i < cols.length; i++) {
      for (let row = 0; row < 4; row++) expect(cols[i]?.[row]).not.toBe(cols[i - 1]?.[row]);
    }
  });

  it('returns empty columns for no ids', () => {
    expect(mosaicColumns([], 2, 3)).toEqual([[], []]);
  });
});
