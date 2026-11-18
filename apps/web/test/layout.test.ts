import { describe, expect, it } from 'vitest';
import { layoutKind } from '../src/lib/layout.js';

describe('layoutKind', () => {
  it('is edge for For you, its See all grids, detail, library and devices: content runs to the gutter', () => {
    for (const p of [
      '/',
      '/games/12',
      '/games/12/',
      '/library',
      '/library/',
      '/devices',
      '/browse',
      '/browse/',
      '/for-you/source-10',
      '/for-you/more/',
      '/for-you/like/42',
    ]) {
      expect(layoutKind(p)).toBe('edge');
    }
  });

  it('is narrow for everything else', () => {
    for (const p of [
      '/account',
      '/library/x',
      '/for-you',
      '/for-you/a/b',
      '/for-you/like/x',
      '/games',
      '/games/12/x',
    ]) {
      expect(layoutKind(p)).toBe('narrow');
    }
  });
});
