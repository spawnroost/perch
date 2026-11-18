import { describe, expect, it } from 'vitest';
import { timeToBeatHours, timeToBeatLabel, timeToBeatTiers } from '../src/lib/timeToBeat.js';

describe('timeToBeatLabel', () => {
  it('uses the Story tier first and falls back to the other figures', () => {
    expect(
      timeToBeatLabel({ hastilyHours: 8, normallyHours: 15, completelyHours: 40, submissions: 5 }),
    ).toBe('About 8 h to beat');
    expect(
      timeToBeatLabel({
        hastilyHours: null,
        normallyHours: 15.5,
        completelyHours: 40,
        submissions: 5,
      }),
    ).toBe('About 15.5 h to beat');
  });
  it('is null with no data and treats zero hours as missing', () => {
    expect(timeToBeatLabel(null)).toBeNull();
    expect(
      timeToBeatLabel({
        hastilyHours: null,
        normallyHours: null,
        completelyHours: null,
        submissions: 5,
      }),
    ).toBeNull();
    expect(
      timeToBeatLabel({ hastilyHours: 0, normallyHours: 0, completelyHours: 0, submissions: 5 }),
    ).toBeNull();
  });
});

describe('timeToBeatHours', () => {
  it('uses the same figure as the label, skipping zero and null', () => {
    expect(
      timeToBeatHours({ hastilyHours: 8, normallyHours: 15, completelyHours: 40, submissions: 5 }),
    ).toBe(8);
    expect(
      timeToBeatHours({ hastilyHours: 0, normallyHours: 15, completelyHours: 40, submissions: 5 }),
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
      timeToBeatHours({ hastilyHours: 0, normallyHours: 0, completelyHours: 0, submissions: 5 }),
    ).toBeNull();
    expect(timeToBeatHours(null)).toBeNull();
  });
});

describe('timeToBeatTiers', () => {
  it('lists the known tiers with bar widths relative to the longest', () => {
    expect(
      timeToBeatTiers({
        hastilyHours: 10,
        normallyHours: 20,
        completelyHours: 40,
        submissions: 1234,
      }),
    ).toEqual({
      tiers: [
        { key: 'hastily', label: 'Story', hours: '10 h', share: 0.25 },
        { key: 'normally', label: 'Story + extras', hours: '20 h', share: 0.5 },
        { key: 'completely', label: '100%', hours: '40 h', share: 1 },
      ],
      source: 'from 1,234 players',
    });
  });
  it('skips missing tiers, keeps decimals and singularises one player', () => {
    expect(
      timeToBeatTiers({
        hastilyHours: null,
        normallyHours: 7.5,
        completelyHours: null,
        submissions: 1,
      }),
    ).toEqual({
      tiers: [{ key: 'normally', label: 'Story + extras', hours: '7.5 h', share: 1 }],
      source: 'from 1 player',
    });
  });
  it('is null with no hours or no data', () => {
    expect(timeToBeatTiers(null)).toBeNull();
    expect(
      timeToBeatTiers({
        hastilyHours: null,
        normallyHours: null,
        completelyHours: null,
        submissions: 3,
      }),
    ).toBeNull();
  });
  it('treats zero hours as unknown', () => {
    expect(
      timeToBeatTiers({ hastilyHours: 0, normallyHours: 0, completelyHours: 0, submissions: 3 }),
    ).toBeNull();
  });
});
