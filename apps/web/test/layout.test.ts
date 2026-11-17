import { describe, expect, it } from 'vitest';
import { isFullBleedPath } from '../src/lib/layout.js';

describe('isFullBleedPath', () => {
  it('is true for For you and game detail only', () => {
    expect(isFullBleedPath('/')).toBe(true);
    expect(isFullBleedPath('/games/12')).toBe(true);
    expect(isFullBleedPath('/games/12/')).toBe(true);
    for (const p of ['/library', '/devices', '/account', '/games', '/games/12/x']) {
      expect(isFullBleedPath(p)).toBe(false);
    }
  });
});
