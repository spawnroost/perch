import { describe, expect, it } from 'vitest';
import { timeToBeatHours, timeToBeatLabel } from '../src/lib/timeToBeat.js';

describe('timeToBeatLabel', () => {
  it('prefers the main-story time and falls back to the other figures', () => {
    expect(
      timeToBeatLabel({ hastilyHours: 8, normallyHours: 15, completelyHours: 40, submissions: 5 }),
    ).toBe('About 15 h to beat');
    expect(
      timeToBeatLabel({
        hastilyHours: 8.5,
        normallyHours: null,
        completelyHours: 40,
        submissions: 5,
      }),
    ).toBe('About 8.5 h to beat');
  });
  it('is null with no data', () => {
    expect(timeToBeatLabel(null)).toBeNull();
    expect(
      timeToBeatLabel({
        hastilyHours: null,
        normallyHours: null,
        completelyHours: null,
        submissions: 5,
      }),
    ).toBeNull();
  });
});

describe('timeToBeatHours', () => {
  it('uses the same figure as the label, null with no data', () => {
    expect(
      timeToBeatHours({ hastilyHours: 8, normallyHours: 15, completelyHours: 40, submissions: 5 }),
    ).toBe(15);
    expect(
      timeToBeatHours({
        hastilyHours: null,
        normallyHours: null,
        completelyHours: 40,
        submissions: 5,
      }),
    ).toBe(40);
    expect(
      timeToBeatHours({
        hastilyHours: null,
        normallyHours: null,
        completelyHours: null,
        submissions: 5,
      }),
    ).toBeNull();
    expect(timeToBeatHours(null)).toBeNull();
  });
});
