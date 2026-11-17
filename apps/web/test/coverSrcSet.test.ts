import { describe, expect, it } from 'vitest';
import { COVER_2X_WIDTH, COVER_FULL_WIDTH, coverImage } from '@/lib/coverSrcSet';

const BIG = 'https://images.igdb.com/igdb/image/upload/t_cover_big/c1.jpg';
const BIG_2X = 'https://images.igdb.com/igdb/image/upload/t_cover_big_2x/c1.jpg';

describe('coverImage', () => {
  it('builds a srcset from the 264w cover and its 528w 2x variant, src is the 264w one', () => {
    expect(coverImage(BIG, '/small.jpg')).toEqual({
      src: BIG,
      srcSet: `${BIG} ${COVER_FULL_WIDTH}w, ${BIG_2X} ${COVER_2X_WIDTH}w`,
    });
  });

  it('never puts the 90w small cover in the srcset', () => {
    expect(coverImage(BIG, '/small.jpg')?.srcSet).not.toContain('small');
  });

  it('omits srcset when the full url is not an IGDB t_cover_big url', () => {
    expect(coverImage('/full.jpg', null)).toEqual({ src: '/full.jpg', srcSet: undefined });
  });

  it('falls back to the small cover as src without a srcset', () => {
    expect(coverImage(null, '/small.jpg')).toEqual({ src: '/small.jpg', srcSet: undefined });
  });

  it('returns null when there is no art', () => {
    expect(coverImage(null, null)).toBeNull();
    expect(coverImage(undefined, '')).toBeNull();
  });
});
