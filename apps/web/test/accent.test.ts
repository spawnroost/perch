import { describe, expect, it } from 'vitest';
import { accentStyle } from '@/lib/accent';

describe('accentStyle', () => {
  it('sets --accent from a hex colour', () => {
    expect(accentStyle('#8a3b2c')).toEqual({ '--accent': '#8a3b2c' });
    expect(accentStyle('#FFF')).toEqual({ '--accent': '#FFF' });
  });

  it('returns nothing for a missing or malformed value, so the token fallback applies', () => {
    expect(accentStyle(null)).toEqual({});
    expect(accentStyle(undefined)).toEqual({});
    expect(accentStyle('')).toEqual({});
    expect(accentStyle('red; background: url(x)')).toEqual({});
    expect(accentStyle('#12')).toEqual({});
  });
});
