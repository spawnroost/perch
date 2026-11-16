import { createDb, games } from '@perch/db';
import { findUnmapped, formatUnmappedReport } from '@perch/taste-vocab';

/** Prints IGDB genre/theme/keyword ids in the games table that have no vocab mapping. */
export async function vocabCheck(databaseUrl: string): Promise<string> {
  const db = createDb(databaseUrl);
  try {
    const rows = await db
      .select({ genres: games.genres, themes: games.themes, keywords: games.keywords })
      .from(games);
    return `${rows.length} games\n\n${formatUnmappedReport(findUnmapped(rows), { topKeywords: 30 })}`;
  } finally {
    await db.$client.end();
  }
}
