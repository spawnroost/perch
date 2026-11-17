import { describe, expect, it } from 'vitest';
import { layoutKind } from '../src/lib/layout.js';

describe('layoutKind', () => {
  it('is edge for For you and game detail: art and shelves run to the gutter', () => {
    for (const p of ['/', '/games/12', '/games/12/']) expect(layoutKind(p)).toBe('edge');
  });

  it('is wide for library and devices: a centred wide column', () => {
    for (const p of ['/library', '/library/', '/devices']) expect(layoutKind(p)).toBe('wide');
  });

  it('is narrow for everything else', () => {
    for (const p of ['/account', '/library/x', '/games', '/games/12/x']) {
      expect(layoutKind(p)).toBe('narrow');
    }
  });
});
