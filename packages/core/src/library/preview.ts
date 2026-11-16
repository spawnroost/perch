import type { IgdbClient } from '../igdb/client.js';
import { pickBestMatch, toSuggestion, type Suggestion } from './match.js';
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

/** The IGDB client already rate-limits requests; this only bounds in-flight searches. */
const SEARCH_CONCURRENCY = 4;

/** Maps with at most `limit` calls in flight; results keep input order. */
async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i] as T);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/** Parses pasted import text and fuzzy-matches each line on IGDB. Writes nothing. */
export async function previewImport(
  client: Pick<IgdbClient, 'searchGames'>,
  text: string,
  maxLines: number,
): Promise<{ lines: ImportPreviewLine[]; errors: { line: number; error: string }[] }> {
  const { entries, errors } = parseImportFile(text);
  if (entries.length > maxLines) throw new ImportTooLargeError(maxLines);
  const lines = await mapLimit(entries, SEARCH_CONCURRENCY, async ({ line, value }) => {
    const { candidates } = await client.searchGames(value.name);
    const { match, suggestions } = pickBestMatch(value.name, candidates);
    return {
      line,
      entry: value,
      match: match ? toSuggestion(match) : null,
      suggestions: suggestions ?? [],
    };
  });
  return { lines, errors };
}
