import type { ExportFile, ExportGame, ExportImportResult } from '@perch/core/browser';

const LABELS: Record<ExportGame['source'], string> = { epic: 'Epic', gog: 'GOG', other: 'Other' };

/** "Found 3 games (Epic 2, GOG 1)" for the parsed export files. */
export function foundSummary(games: readonly ExportGame[]): string {
  if (games.length === 0) return 'No games found';
  const counts = new Map<ExportGame['source'], number>();
  for (const game of games) counts.set(game.source, (counts.get(game.source) ?? 0) + 1);
  const parts = (['epic', 'gog', 'other'] as const)
    .filter((s) => counts.has(s))
    .map((s) => `${LABELS[s]} ${counts.get(s)}`);
  return `Found ${games.length} ${games.length === 1 ? 'game' : 'games'} (${parts.join(', ')})`;
}

export function importResultSummary({
  imported,
  updated,
  unmatchedCount,
  total,
}: ExportImportResult): string {
  const base = `Imported ${imported} new and updated ${updated} of ${total} games.`;
  return unmatchedCount > 0 ? `${base} ${unmatchedCount} could not be matched.` : base;
}

export function readExportFiles(files: readonly File[]): Promise<ExportFile[]> {
  return Promise.all(files.map(async (f) => ({ name: f.name, text: await f.text() })));
}
