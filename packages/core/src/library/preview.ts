import type { IgdbClient } from '../igdb/client.js';
import { pickBestMatch, type Suggestion } from './match.js';
import { parseImportFile, type ImportEntry } from './parse.js';

export interface ImportPreviewLine {
  line: number;
  entry: ImportEntry;
  /** The exact IGDB match, or null (then `suggestions` lists the closest). */
  match: Suggestion | null;
  suggestions: Suggestion[];
}

export class ImportTooLargeError extends Error {
  constructor(readonly max: number) {
    super(`too many lines (max ${max})`);
    this.name = 'ImportTooLargeError';
  }
}

/** Parses pasted import text and fuzzy-matches each line on IGDB. Writes nothing. */
export async function previewImport(
  client: Pick<IgdbClient, 'searchGames'>,
  text: string,
  maxLines: number,
): Promise<{ lines: ImportPreviewLine[]; errors: { line: number; error: string }[] }> {
  const { entries, errors } = parseImportFile(text);
  if (entries.length > maxLines) throw new ImportTooLargeError(maxLines);
  const lines: ImportPreviewLine[] = [];
  for (const { line, value } of entries) {
    const { candidates } = await client.searchGames(value.name);
    const { match, suggestions } = pickBestMatch(value.name, candidates);
    lines.push({
      line,
      entry: value,
      match: match
        ? {
            igdbId: match.igdbId,
            name: match.name,
            year: match.firstRelease ? match.firstRelease.getUTCFullYear() : null,
          }
        : null,
      suggestions: suggestions ?? [],
    });
  }
  return { lines, errors };
}
