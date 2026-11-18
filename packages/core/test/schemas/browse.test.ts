import { describe, expect, it } from 'vitest';
import { browseQuerySchema } from '../../src/schemas/browse.js';

describe('browseQuerySchema', () => {
  it('parses comma lists and defaults', () => {
    expect(browseQuerySchema.parse({ genres: '1,2', themes: '3' })).toEqual({
      genres: [1, 2],
      themes: [3],
      limit: 20,
      offset: 0,
    });
  });
  it('takes device, limit and offset; dedupes ids', () => {
    expect(
      browseQuerySchema.parse({ genres: '1,1', deviceId: 'abc', limit: '60', offset: '40' }),
    ).toMatchObject({ genres: [1], themes: [], deviceId: 'abc', limit: 60, offset: 40 });
  });
  it('rejects no tags, bad ids and limit above 60', () => {
    expect(browseQuerySchema.safeParse({}).success).toBe(false);
    expect(browseQuerySchema.safeParse({ genres: 'a' }).success).toBe(false);
    expect(browseQuerySchema.safeParse({ genres: '1', limit: '61' }).success).toBe(false);
    expect(browseQuerySchema.safeParse({ genres: '1', offset: '-1' }).success).toBe(false);
  });
});
