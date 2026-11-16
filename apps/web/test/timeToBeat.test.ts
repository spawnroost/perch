import { describe, expect, it } from 'vitest';
import { timeToBeatLabel } from '../src/lib/timeToBeat.js';

describe('timeToBeatLabel', () => {
  it('prefers the main-story time and falls back to the other figures', () => {
    expect(timeToBeatLabel({ hastilyHours: 8, normallyHours: 15, completelyHours: 40 })).toBe(
      'About 15 h to beat',
    );
    expect(timeToBeatLabel({ hastilyHours: 8.5, normallyHours: null, completelyHours: 40 })).toBe(
      'About 8.5 h to beat',
    );
  });
  it('is null with no data', () => {
    expect(timeToBeatLabel(null)).toBeNull();
    expect(
      timeToBeatLabel({ hastilyHours: null, normallyHours: null, completelyHours: null }),
    ).toBeNull();
  });
});
