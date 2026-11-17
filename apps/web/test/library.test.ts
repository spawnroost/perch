import { describe, expect, it } from 'vitest';
import type { LibraryEntry } from '@perch/core';
import {
  buildPatch,
  games,
  filterLibrary,
  formatHours,
  formatLastPlayed,
  sortLibrary,
  toForm,
} from '../src/lib/library.js';

function entry(over: Partial<LibraryEntry>): LibraryEntry {
  return {
    id: 'e',
    igdbId: 1,
    name: 'Game',
    coverUrl: null,
    platform: 'pc',
    hoursPlayed: null,
    lastPlayed: null,
    status: 'backlog',
    owned: true,
    source: 'manual',
    addedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

const a = entry({
  id: 'a',
  name: 'Alpha',
  hoursPlayed: 10,
  lastPlayed: '2026-03-01T00:00:00.000Z',
});
const b = entry({ id: 'b', name: 'beta', hoursPlayed: 50, lastPlayed: '2026-05-01T00:00:00.000Z' });
const c = entry({
  id: 'c',
  name: 'Charlie',
  status: 'playing',
  addedAt: '2026-06-01T00:00:00.000Z',
});

describe('sortLibrary', () => {
  const ids = (list: LibraryEntry[]) => list.map((e) => e.id);
  it('recent puts the latest last played first and never-played last', () => {
    expect(ids(sortLibrary([c, a, b], 'recent'))).toEqual(['b', 'a', 'c']);
  });
  it('hours sorts by most played, unknown hours last', () => {
    expect(ids(sortLibrary([c, a, b], 'hours'))).toEqual(['b', 'a', 'c']);
  });
  it('title ignores case', () => {
    expect(ids(sortLibrary([c, b, a], 'title'))).toEqual(['a', 'b', 'c']);
  });
  it('added puts the newest first', () => {
    expect(ids(sortLibrary([a, c, b], 'added'))[0]).toBe('c');
  });
  it('does not mutate its input', () => {
    const input = [c, a, b];
    sortLibrary(input, 'title');
    expect(input.map((e) => e.id)).toEqual(['c', 'a', 'b']);
  });
});

describe('filterLibrary', () => {
  it('matches the name case-insensitively', () => {
    expect(filterLibrary([a, b, c], { query: ' ALP ', status: 'all' })).toEqual([a]);
  });
  it('filters by status', () => {
    expect(filterLibrary([a, b, c], { query: '', status: 'playing' })).toEqual([c]);
  });
  it('returns everything for an empty filter', () => {
    expect(filterLibrary([a, b, c], { query: '', status: 'all' })).toHaveLength(3);
  });
});

describe('formatting', () => {
  it('formats hours', () => {
    expect(formatHours(null)).toBe('No hours');
    expect(formatHours(12)).toBe('12 h');
    expect(formatHours(1.5)).toBe('1.5 h');
  });
  it('formats the last played date in UTC', () => {
    expect(formatLastPlayed(null)).toBe('Never played');
    expect(formatLastPlayed('2026-06-03T00:00:00.000Z')).toBe('3 Jun 2026');
  });
});

describe('buildPatch', () => {
  const base = entry({
    hoursPlayed: 10,
    lastPlayed: '2026-03-01T00:00:00.000Z',
    status: 'playing',
  });
  it('seeds the form from the entry', () => {
    expect(toForm(base)).toEqual({ hours: '10', lastPlayed: '2026-03-01', status: 'playing' });
    expect(toForm(entry({}))).toEqual({ hours: '', lastPlayed: '', status: 'backlog' });
  });
  it('sends only what changed', () => {
    expect(buildPatch(base, { ...toForm(base), hours: '12.5' })).toEqual({
      ok: true,
      patch: { hoursPlayed: 12.5 },
    });
  });
  it('returns no patch when nothing changed', () => {
    expect(buildPatch(base, toForm(base))).toEqual({ ok: true, patch: null });
  });
  it('clears hours and date with null', () => {
    expect(buildPatch(base, { ...toForm(base), hours: '', lastPlayed: '' })).toEqual({
      ok: true,
      patch: { hoursPlayed: null, lastPlayed: null },
    });
  });
  it('does not clear what was already empty', () => {
    const empty = entry({});
    expect(buildPatch(empty, toForm(empty))).toEqual({ ok: true, patch: null });
  });
  it('rejects invalid hours', () => {
    expect(buildPatch(base, { ...toForm(base), hours: 'abc' })).toEqual({
      ok: false,
      error: 'Enter hours as a number, like 12 or 1.5.',
    });
  });
  it('rejects a malformed date', () => {
    expect(buildPatch(base, { ...toForm(base), lastPlayed: '03/01/2026' }).ok).toBe(false);
  });
  it('sends a changed status', () => {
    expect(buildPatch(base, { ...toForm(base), status: 'finished' })).toEqual({
      ok: true,
      patch: { status: 'finished' },
    });
  });
});

describe('impossible dates', () => {
  const base = entry({ lastPlayed: null });
  it('rejects dates that do not exist', () => {
    for (const d of ['2026-02-30', '2026-13-01', '2026-00-10', '2026-04-31', '2025-02-29']) {
      expect(buildPatch(base, { ...toForm(base), lastPlayed: d }).ok, d).toBe(false);
    }
  });
  it('accepts real dates including leap days', () => {
    expect(buildPatch(base, { ...toForm(base), lastPlayed: '2024-02-29' }).ok).toBe(true);
  });
});

describe('games', () => {
  it('pluralizes', () => {
    expect(games(1)).toBe('1 game');
    expect(games(0)).toBe('0 games');
    expect(games(12)).toBe('12 games');
  });
});
