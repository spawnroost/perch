import { describe, expect, it } from 'vitest';
import { layoutKind } from '../src/lib/layout.js';

describe('layoutKind', () => {
  it('is edge for For you, detail, library and devices: content runs to the gutter', () => {
    for (const p of ['/', '/games/12', '/games/12/', '/library', '/library/', '/devices']) {
      expect(layoutKind(p)).toBe('edge');
    }
  });

  it('is narrow for everything else', () => {
    for (const p of ['/account', '/library/x', '/games', '/games/12/x']) {
      expect(layoutKind(p)).toBe('narrow');
    }
  });
});
