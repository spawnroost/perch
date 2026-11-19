import { describe, expect, it } from 'vitest';
import { isPlayedBefore } from '../../src/index.js';

const old = new Date('2020-01-01T00:00:00Z');

describe('isPlayedBefore', () => {
  it('needs a backlog status and at least an hour of known playtime', () => {
    expect(isPlayedBefore({ status: 'backlog', minutes: 60, lastPlayed: old })).toBe(true);
    expect(isPlayedBefore({ status: 'backlog', minutes: 59, lastPlayed: old })).toBe(false);
    expect(isPlayedBefore({ status: 'backlog', minutes: 6000, lastPlayed: null })).toBe(true);
    expect(isPlayedBefore({ status: 'playing', minutes: 6000, lastPlayed: new Date() })).toBe(
      false,
    );
  });
  it('without minutes (Xbox) needs a last-played date and some achievement progress', () => {
    const base = { status: 'backlog' as const, lastPlayed: old };
    expect(isPlayedBefore({ ...base, achievementProgress: 12 })).toBe(true);
    expect(isPlayedBefore({ ...base, achievementProgress: 0 })).toBe(false);
    expect(isPlayedBefore({ ...base })).toBe(false);
    expect(isPlayedBefore({ status: 'backlog', lastPlayed: null, achievementProgress: 50 })).toBe(
      false,
    );
  });
});
