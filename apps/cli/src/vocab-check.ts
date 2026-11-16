import { createIgdbClientFromEnv } from '@perch/core';
import { createDb, games } from '@perch/db';
import { findUnmapped, formatUnmappedReport } from '@perch/taste-vocab';

const TOP_KEYWORDS = 80;

/** Prints IGDB genre/theme/keyword ids in the games table that have no vocab mapping. */
export async function vocabCheck(databaseUrl: string): Promise<string> {
  const db = createDb(databaseUrl);
  try {
    const rows = await db
      .select({ genres: games.genres, themes: games.themes, keywords: games.keywords })
      .from(games);
    const report = findUnmapped(rows);
    let names: Record<number, string> | undefined;
    let warning = '';
    try {
      const top = report.keywords.slice(0, TOP_KEYWORDS).map((k) => k.id);
      names = await createIgdbClientFromEnv().keywordNames(top);
    } catch (err) {
      warning = `warning: could not fetch keyword names (${err instanceof Error ? err.message : String(err)}); showing ids only\n`;
    }
    return `${warning}${rows.length} games\n\n${formatUnmappedReport(report, { topKeywords: TOP_KEYWORDS, names })}`;
  } finally {
    await db.$client.end();
  }
}
