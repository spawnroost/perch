/** Import preview state: which game each pasted line resolves to, and the confirm payload. */
import type { ImportConfirm, ImportPreviewResponse } from '@perch/core';

type Line = ImportPreviewResponse['lines'][number];
type Option = NonNullable<Line['match']>;

export interface ImportRow {
  line: number;
  name: string;
  hoursPlayed: number | null;
  lastPlayed: string | null;
  status: Line['status'];
  /** The game IGDB matched first, then other candidates. */
  options: Option[];
  /** The chosen game, or null to skip this line. */
  selected: number | null;
}

export function initialRows(lines: Line[]): ImportRow[] {
  return lines.map((l) => ({
    line: l.line,
    name: l.name,
    hoursPlayed: l.hoursPlayed,
    lastPlayed: l.lastPlayed,
    status: l.status,
    options: l.match
      ? [l.match, ...l.suggestions.filter((s) => s.igdbId !== l.match?.igdbId)]
      : l.suggestions,
    selected: l.match?.igdbId ?? null,
  }));
}

/** Choose a candidate for a line; null skips it. An id that is not an option is ignored. */
export function selectMatch(rows: ImportRow[], line: number, igdbId: number | null): ImportRow[] {
  return rows.map((r) =>
    r.line === line && (igdbId === null || r.options.some((o) => o.igdbId === igdbId))
      ? { ...r, selected: igdbId }
      : r,
  );
}

export const unmatchedCount = (rows: ImportRow[]) => rows.filter((r) => r.selected === null).length;

type Item = ImportConfirm['items'][number];

/** One item per distinct game (first line wins); empty fields are left out. */
export function confirmItems(rows: ImportRow[]): Item[] {
  const seen = new Set<number>();
  const items: Item[] = [];
  for (const r of rows) {
    if (r.selected === null || seen.has(r.selected)) continue;
    seen.add(r.selected);
    items.push({
      igdbId: r.selected,
      ...(r.hoursPlayed !== null && { hoursPlayed: r.hoursPlayed }),
      ...(r.lastPlayed !== null && { lastPlayed: r.lastPlayed }),
      ...(r.status !== null && { status: r.status }),
    });
  }
  return items;
}

export const canConfirm = (rows: ImportRow[]) => confirmItems(rows).length > 0;

const games = (n: number) => `${n} game${n === 1 ? '' : 's'}`;

export function summarizeImport(result: { imported: unknown[]; failed: unknown[] }): string {
  const done = `Imported ${games(result.imported.length)}.`;
  return result.failed.length > 0 ? `${done} ${result.failed.length} failed.` : done;
}
