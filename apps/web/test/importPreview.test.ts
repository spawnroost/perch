import { describe, expect, it } from 'vitest';
import type { ImportPreviewResponse } from '@perch/core';
import {
  canConfirm,
  confirmItems,
  initialRows,
  selectMatch,
  summarizeImport,
  unmatchedCount,
} from '../src/lib/importPreview.js';

const s = (igdbId: number, name = `G${igdbId}`) => ({ igdbId, name, year: 2020 });
const lines: ImportPreviewResponse['lines'] = [
  {
    line: 1,
    name: 'Hades',
    hoursPlayed: 40,
    lastPlayed: '2026-02-01T00:00:00.000Z',
    status: 'finished',
    match: s(1),
    suggestions: [s(1), s(2)],
  },
  {
    line: 2,
    name: 'Celest',
    hoursPlayed: null,
    lastPlayed: null,
    status: null,
    match: null,
    suggestions: [s(3)],
  },
  {
    line: 3,
    name: 'Nothing',
    hoursPlayed: null,
    lastPlayed: null,
    status: null,
    match: null,
    suggestions: [],
  },
];

describe('initialRows', () => {
  it('selects the confident match and leaves the rest unmatched', () => {
    const rows = initialRows(lines);
    expect(rows.map((r) => r.selected)).toEqual([1, null, null]);
    expect(unmatchedCount(rows)).toBe(2);
  });
  it('lists the match once, first, among the options', () => {
    expect(initialRows(lines)[0]!.options.map((o) => o.igdbId)).toEqual([1, 2]);
  });
});

describe('selectMatch', () => {
  it('picks a suggestion for a line', () => {
    const rows = selectMatch(initialRows(lines), 2, 3);
    expect(rows[1]!.selected).toBe(3);
  });
  it('skips a line with null', () => {
    expect(selectMatch(initialRows(lines), 1, null)[0]!.selected).toBeNull();
  });
  it('ignores an id that is not an option', () => {
    expect(selectMatch(initialRows(lines), 2, 99)[1]!.selected).toBeNull();
  });
});

describe('confirmItems', () => {
  it('builds items for selected lines and omits empty fields', () => {
    const rows = selectMatch(initialRows(lines), 2, 3);
    expect(confirmItems(rows)).toEqual([
      { igdbId: 1, hoursPlayed: 40, lastPlayed: '2026-02-01T00:00:00.000Z', status: 'finished' },
      { igdbId: 3 },
    ]);
  });
  it('keeps one item when two lines resolve to the same game', () => {
    const rows = selectMatch(initialRows(lines), 2, 3).map((r) => ({
      ...r,
      options: [s(1), ...r.options],
      selected: 1,
    }));
    expect(confirmItems(rows)).toHaveLength(1);
  });
  it('cannot confirm with nothing selected', () => {
    expect(canConfirm(selectMatch(initialRows(lines), 1, null))).toBe(false);
    expect(canConfirm(initialRows(lines))).toBe(true);
  });
});

describe('summarizeImport', () => {
  it('reports counts', () => {
    expect(summarizeImport({ imported: [{ igdbId: 1, name: 'A' }], failed: [] })).toBe(
      'Imported 1 game.',
    );
    expect(
      summarizeImport({
        imported: [s(1), s(2)],
        failed: [{ igdbId: 3, error: 'x' }],
      }),
    ).toBe('Imported 2 games. 1 failed.');
  });
});
