import { describe, expect, it } from 'vitest';
import { AUTH_COVER_IDS, igdbCoverUrl, mosaicColumns } from '../src/lib/authMosaic.js';

describe('AUTH_COVER_IDS', () => {
  it('are unique IGDB image ids', () => {
    expect(new Set(AUTH_COVER_IDS).size).toBe(AUTH_COVER_IDS.length);
    for (const id of AUTH_COVER_IDS) expect(id).toMatch(/^co[a-z0-9]+$/);
  });
});

describe('igdbCoverUrl', () => {
  it('builds the public image url for a size', () => {
    expect(igdbCoverUrl('co1abc', 't_cover_big')).toBe(
      'https://images.igdb.com/igdb/image/upload/t_cover_big/co1abc.jpg',
    );
  });
});

describe('mosaicColumns', () => {
  it('deals ids round-robin into columns', () => {
    expect(mosaicColumns(['a', 'b', 'c', 'd', 'e'], 2, 3)).toEqual([
      ['a', 'c', 'e'],
      ['b', 'd', 'a'],
    ]);
  });

  it('repeats ids to fill every column to the same length', () => {
    const cols = mosaicColumns(['a', 'b'], 3, 4);
    expect(cols).toHaveLength(3);
    for (const c of cols) expect(c).toHaveLength(4);
  });

  it('returns empty columns for no ids', () => {
    expect(mosaicColumns([], 2, 3)).toEqual([[], []]);
  });
});
