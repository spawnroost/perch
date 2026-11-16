import { GENRE_MAP, KEYWORD_MAP, THEME_MAP, type IgdbMap } from './igdb-map.js';
import { VOCAB_IDS, type VocabId } from './vocab.js';

export interface GameIgdbIds {
  genres?: readonly number[] | null;
  themes?: readonly number[] | null;
  keywords?: readonly number[] | null;
}

export type TasteVector = Record<VocabId, number>;

function blank(): TasteVector {
  return Object.fromEntries(VOCAB_IDS.map((id) => [id, 0])) as TasteVector;
}

/**
 * Sums mapped weights over a game's IGDB ids, then scales so the strongest
 * vocab id is exactly 1. Unknown ids are ignored. Every VocabId is present.
 */
export function mapGame({ genres, themes, keywords }: GameIgdbIds): TasteVector {
  const sums = blank();
  const add = (ids: readonly number[] | null | undefined, table: IgdbMap): void => {
    for (const id of ids ?? []) {
      const targets = Object.hasOwn(table, id) ? table[id] : undefined;
      if (!targets) continue;
      for (const [vocabId, w] of Object.entries(targets)) sums[vocabId as VocabId] += w;
    }
  };
  add(genres, GENRE_MAP);
  add(themes, THEME_MAP);
  add(keywords, KEYWORD_MAP);

  const max = Math.max(...Object.values(sums));
  if (max <= 0) return sums;
  for (const id of VOCAB_IDS) sums[id] = Math.min(1, sums[id] / max);
  return sums;
}

export interface UnmappedCount {
  id: number;
  count: number;
}

export interface UnmappedReport {
  genres: UnmappedCount[];
  themes: UnmappedCount[];
  keywords: UnmappedCount[];
}

function countUnmapped(
  games: readonly GameIgdbIds[],
  pick: (g: GameIgdbIds) => readonly number[] | null | undefined,
  table: IgdbMap,
): UnmappedCount[] {
  const counts = new Map<number, number>();
  for (const g of games) {
    for (const id of new Set(pick(g) ?? [])) {
      if (Object.hasOwn(table, id)) continue;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  return [...counts]
    .map(([id, count]) => ({ id, count }))
    .sort((a, b) => b.count - a.count || a.id - b.id);
}

/** IGDB ids used by the given games that have no vocab mapping, most frequent first. */
export function findUnmapped(games: readonly GameIgdbIds[]): UnmappedReport {
  return {
    genres: countUnmapped(games, (g) => g.genres, GENRE_MAP),
    themes: countUnmapped(games, (g) => g.themes, THEME_MAP),
    keywords: countUnmapped(games, (g) => g.keywords, KEYWORD_MAP),
  };
}

/** Plain-text report for `perch vocab:check`: all genres/themes, top N keywords. */
export function formatUnmappedReport(
  report: UnmappedReport,
  opts: { topKeywords?: number } = {},
): string {
  const topKeywords = opts.topKeywords ?? 30;
  const section = (title: string, rows: UnmappedCount[]): string =>
    [`${title} (${rows.length} unmapped)`, ...rows.map((r) => `  ${r.id}\t${r.count}`)].join('\n');
  return [
    section('Genres', report.genres),
    section('Themes', report.themes),
    section(`Keywords (top ${topKeywords})`, report.keywords.slice(0, topKeywords)),
  ].join('\n\n');
}
