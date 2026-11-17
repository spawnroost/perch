import { describe, expect, it } from 'vitest';
import { isFullBleedPath } from '../src/lib/layout.js';

describe('isFullBleedPath', () => {
  it('is true for For you, game detail, library and devices only', () => {
    expect(isFullBleedPath('/')).toBe(true);
    expect(isFullBleedPath('/games/12')).toBe(true);
    expect(isFullBleedPath('/games/12/')).toBe(true);
    expect(isFullBleedPath('/library')).toBe(true);
    expect(isFullBleedPath('/devices')).toBe(true);
    for (const p of ['/account', '/library/x', '/games', '/games/12/x']) {
      expect(isFullBleedPath(p)).toBe(false);
    }
  });
});
