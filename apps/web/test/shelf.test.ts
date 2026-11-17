import { describe, expect, it } from 'vitest';
import { edgeFadeState, nextFocusIndex, scrollStep } from '@/lib/shelf';

describe('nextFocusIndex', () => {
  it('moves right and left by one', () => {
    expect(nextFocusIndex(1, 'ArrowRight', 5)).toBe(2);
    expect(nextFocusIndex(1, 'ArrowLeft', 5)).toBe(0);
  });

  it('clamps at both ends instead of wrapping', () => {
    expect(nextFocusIndex(4, 'ArrowRight', 5)).toBe(4);
    expect(nextFocusIndex(0, 'ArrowLeft', 5)).toBe(0);
  });

  it('jumps to the ends with Home and End', () => {
    expect(nextFocusIndex(2, 'Home', 5)).toBe(0);
    expect(nextFocusIndex(2, 'End', 5)).toBe(4);
  });

  it('starts from the first item when nothing is focused (-1)', () => {
    expect(nextFocusIndex(-1, 'ArrowRight', 5)).toBe(0);
    expect(nextFocusIndex(-1, 'ArrowLeft', 5)).toBe(0);
  });

  it('returns null for other keys and empty shelves', () => {
    expect(nextFocusIndex(1, 'Enter', 5)).toBeNull();
    expect(nextFocusIndex(0, 'ArrowRight', 0)).toBeNull();
  });
});

describe('edgeFadeState', () => {
  it('shows no fades when everything fits', () => {
    expect(edgeFadeState({ scrollLeft: 0, scrollWidth: 400, clientWidth: 400 })).toEqual({
      start: false,
      end: false,
    });
  });

  it('shows only the end fade at the start of a scrollable row', () => {
    expect(edgeFadeState({ scrollLeft: 0, scrollWidth: 1000, clientWidth: 400 })).toEqual({
      start: false,
      end: true,
    });
  });

  it('shows both fades mid-scroll and only the start fade at the end', () => {
    expect(edgeFadeState({ scrollLeft: 200, scrollWidth: 1000, clientWidth: 400 })).toEqual({
      start: true,
      end: true,
    });
    expect(edgeFadeState({ scrollLeft: 600, scrollWidth: 1000, clientWidth: 400 })).toEqual({
      start: true,
      end: false,
    });
  });

  it('tolerates sub-pixel rounding at the ends', () => {
    expect(edgeFadeState({ scrollLeft: 599.4, scrollWidth: 1000, clientWidth: 400 }).end).toBe(
      false,
    );
    expect(edgeFadeState({ scrollLeft: 0.4, scrollWidth: 1000, clientWidth: 400 }).start).toBe(
      false,
    );
  });
});

describe('scrollStep', () => {
  it('scrolls most of a viewport, signed by direction', () => {
    expect(scrollStep(1000, 'next')).toBe(800);
    expect(scrollStep(1000, 'prev')).toBe(-800);
  });
});
