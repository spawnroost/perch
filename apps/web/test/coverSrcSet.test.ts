import { describe, expect, it } from 'vitest';
import { COVER_FULL_WIDTH, COVER_SMALL_WIDTH, coverImage } from '@/lib/coverSrcSet';

describe('coverImage', () => {
  it('builds a width-descriptor srcset from both sizes, defaulting src to the full one', () => {
    expect(coverImage('/full.jpg', '/small.jpg')).toEqual({
      src: '/full.jpg',
      srcSet: `/small.jpg ${COVER_SMALL_WIDTH}w, /full.jpg ${COVER_FULL_WIDTH}w`,
    });
  });

  it('omits srcset when only one size exists', () => {
    expect(coverImage('/full.jpg', null)).toEqual({ src: '/full.jpg', srcSet: undefined });
    expect(coverImage(null, '/small.jpg')).toEqual({ src: '/small.jpg', srcSet: undefined });
  });

  it('omits srcset when both urls are the same', () => {
    expect(coverImage('/a.jpg', '/a.jpg')).toEqual({ src: '/a.jpg', srcSet: undefined });
  });

  it('returns null when there is no art', () => {
    expect(coverImage(null, null)).toBeNull();
    expect(coverImage(undefined, '')).toBeNull();
  });
});
