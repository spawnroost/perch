import { describe, expect, it } from 'vitest';
import { collectPlayedBefore, isPlayedBefore } from '../../src/index.js';

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

describe('collectPlayedBefore', () => {
  it('lists only newly created entries that are candidates, most played first', () => {
    const created = [
      { id: 'a', igdbId: 1, platform: 'pc' },
      { id: 'b', igdbId: 2, platform: 'pc' },
      { id: 'c', igdbId: 3, platform: 'pc' },
      { id: 'd', igdbId: 4, platform: 'xbox' },
    ];
    const candidates = new Map([
      ['1:pc', { title: 'Alpha', minutes: 90, lastPlayed: old }],
      ['3:pc', { title: 'Gamma', minutes: 600, lastPlayed: null }],
      ['4:xbox', { title: 'Delta', minutes: null, lastPlayed: old }],
      ['9:pc', { title: 'Existing', minutes: 900, lastPlayed: old }],
    ]);
    expect(collectPlayedBefore(created, candidates)).toEqual([
      { entryId: 'c', title: 'Gamma', minutes: 600, lastPlayed: null },
      { entryId: 'a', title: 'Alpha', minutes: 90, lastPlayed: old.toISOString() },
      { entryId: 'd', title: 'Delta', minutes: null, lastPlayed: old.toISOString() },
    ]);
  });
});
