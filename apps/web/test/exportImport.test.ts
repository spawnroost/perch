import { describe, expect, it } from 'vitest';
import type { ExportGame, ExportImportResult } from '@perch/core/browser';
import { foundSummary, importResultSummary, readExportFiles } from '../src/lib/exportImport.js';

const g = (source: ExportGame['source'], title: string): ExportGame => ({ source, title });

describe('foundSummary', () => {
  it('counts games per store and leaves out empty stores', () => {
    expect(foundSummary([g('epic', 'a'), g('epic', 'b'), g('gog', 'c')])).toBe(
      'Found 3 games (Epic 2, GOG 1)',
    );
    expect(foundSummary([g('other', 'a')])).toBe('Found 1 game (Other 1)');
    expect(foundSummary([])).toBe('No games found');
  });
});

describe('importResultSummary', () => {
  const base: ExportImportResult = {
    imported: 10,
    updated: 2,
    unmatched: [],
    unmatchedCount: 0,
    total: 12,
    playedBefore: [],
  };
  it('lists the counts and mentions unmatched games only when there are some', () => {
    expect(importResultSummary(base)).toBe('Imported 10 new and updated 2 of 12 games.');
    expect(importResultSummary({ ...base, unmatched: ['x'], unmatchedCount: 1 })).toBe(
      'Imported 10 new and updated 2 of 12 games. 1 could not be matched.',
    );
  });
});

describe('readExportFiles', () => {
  it('reads each file as name and text', async () => {
    const files = [new File(['{"a":1}'], 'a.json'), new File(['x,y'], 'b.csv')];
    expect(await readExportFiles(files)).toEqual([
      { name: 'a.json', text: '{"a":1}' },
      { name: 'b.csv', text: 'x,y' },
    ]);
  });
});
