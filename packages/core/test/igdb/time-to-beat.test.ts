import { describe, expect, it } from 'vitest';
import { toTimeToBeatHours } from '../../src/igdb/time-to-beat.js';

const hour = 3600;

describe('toTimeToBeatHours', () => {
  it('converts seconds to hours, rounded to one decimal', () => {
    expect(
      toTimeToBeatHours({
        hastilySeconds: 10 * hour,
        normallySeconds: 15.26 * hour,
        completelySeconds: null,
        count: 20,
      }),
    ).toEqual({
      hastilyHours: 10,
      normallyHours: 15.3,
      completelyHours: null,
      submissions: 20,
    });
  });
  it('is null for no data, an all-null row, or fewer than 5 submissions', () => {
    expect(toTimeToBeatHours(null)).toBeNull();
    expect(
      toTimeToBeatHours({
        hastilySeconds: null,
        normallySeconds: null,
        completelySeconds: null,
        count: 9,
      }),
    ).toBeNull();
    expect(
      toTimeToBeatHours({
        hastilySeconds: hour,
        normallySeconds: hour,
        completelySeconds: hour,
        count: 4,
      }),
    ).toBeNull();
  });
  it('keeps a row with an unknown count', () => {
    expect(
      toTimeToBeatHours({
        hastilySeconds: null,
        normallySeconds: 2 * hour,
        completelySeconds: null,
        count: null,
      }),
    ).toEqual({
      hastilyHours: null,
      normallyHours: 2,
      completelyHours: null,
      submissions: 0,
    });
  });
});
