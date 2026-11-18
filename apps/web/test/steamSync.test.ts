import { describe, expect, it } from 'vitest';
import { STEAM_PRIVATE_HELP } from '@perch/core';
import { steamSyncErrorText, steamSyncSummary, syncedAgo } from '../src/lib/steamSync.js';
import { ApiError } from '../src/lib/api.js';

const now = new Date('2026-06-01T12:00:00Z');
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();

describe('syncedAgo', () => {
  it('says never when there is no sync', () => {
    expect(syncedAgo(null, now)).toBe('Never synced');
  });
  it('formats minutes, hours and days', () => {
    expect(syncedAgo(ago(20_000), now)).toBe('Synced just now');
    expect(syncedAgo(ago(5 * 60_000), now)).toBe('Synced 5 min ago');
    expect(syncedAgo(ago(3 * 3_600_000), now)).toBe('Synced 3 h ago');
    expect(syncedAgo(ago(2 * 86_400_000), now)).toBe('Synced 2 days ago');
    expect(syncedAgo(ago(86_400_000), now)).toBe('Synced 1 day ago');
  });
});

describe('steamSyncSummary', () => {
  it('lists the counts and only mentions unmatched games when there are some', () => {
    expect(steamSyncSummary({ imported: 12, updated: 3, unmatched: 0, total: 15 })).toBe(
      'Imported 12 new and updated 3 of 15 games.',
    );
    expect(steamSyncSummary({ imported: 1, updated: 0, unmatched: 4, total: 5 })).toBe(
      'Imported 1 new and updated 0 of 5 games. 4 could not be matched.',
    );
  });
});

describe('steamSyncErrorText', () => {
  it('shows the Steam privacy help for a private profile', () => {
    expect(steamSyncErrorText(new ApiError(409, 'steam_profile_private'))).toBe(STEAM_PRIVATE_HELP);
    expect(STEAM_PRIVATE_HELP).toMatch(/Privacy Settings.*Game details.*Public/);
  });
  it('explains the other codes and passes unknown errors through', () => {
    expect(steamSyncErrorText(new ApiError(503, 'steam_not_configured'))).toMatch(/not set up/);
    expect(steamSyncErrorText(new ApiError(502, 'steam_unavailable'))).toMatch(/try again/i);
    expect(steamSyncErrorText(new ApiError(0, 'Could not reach the server.'))).toBe(
      'Could not reach the server.',
    );
    expect(steamSyncErrorText('boom')).toBe('Steam sync failed. Try again.');
  });
});
