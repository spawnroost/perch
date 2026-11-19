import { describe, expect, it } from 'vitest';
import { shouldAutoSync, steamImportStatus } from '../../src/index.js';

const now = new Date('2026-06-01T00:00:00Z');
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);

describe('steamImportStatus', () => {
  it('is backlog for an unplayed game', () => {
    expect(steamImportStatus({ minutes: 0, lastPlayed: null, now })).toBe('backlog');
  });
  it('is playing when played in the last 30 days', () => {
    expect(steamImportStatus({ minutes: 600, lastPlayed: daysAgo(3), now })).toBe('playing');
    expect(steamImportStatus({ minutes: 600, lastPlayed: daysAgo(30), now })).toBe('playing');
  });
  it('is backlog (undecided) when played longer ago', () => {
    expect(steamImportStatus({ minutes: 600, lastPlayed: daysAgo(31), now })).toBe('backlog');
    expect(steamImportStatus({ minutes: 600, lastPlayed: null, now })).toBe('backlog');
  });
});

describe('steamImportStatus without playtime (Xbox)', () => {
  it('goes by last played alone', () => {
    expect(steamImportStatus({ lastPlayed: daysAgo(3), now })).toBe('playing');
    expect(steamImportStatus({ lastPlayed: daysAgo(31), now })).toBe('backlog');
    expect(steamImportStatus({ lastPlayed: null, now })).toBe('backlog');
  });
});

describe('shouldAutoSync', () => {
  it('syncs when never synced or 6 hours have passed', () => {
    expect(shouldAutoSync(null, now)).toBe(true);
    expect(shouldAutoSync(new Date(now.getTime() - 6 * 3_600_000), now)).toBe(true);
    expect(shouldAutoSync(new Date(now.getTime() - 5 * 3_600_000), now)).toBe(false);
  });
});
