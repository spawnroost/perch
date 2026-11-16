import type { GameCandidate } from '../igdb/schemas.js';

/** Lowercase, drop diacritics/marks/punctuation and a leading "the". */
export function normaliseName(name: string): string {
  return name
    .replace(/[™®©]/g, '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/^the /, '');
}

export interface Suggestion {
  igdbId: number;
  name: string;
  year: number | null;
}

export type MatchResult =
  { match: GameCandidate; suggestions?: undefined } | { match: null; suggestions: Suggestion[] };

const byRatingCount = (a: GameCandidate, b: GameCandidate): number => b.ratingCount - a.ratingCount;

/**
 * Exact (normalised) name match only, highest rating count among duplicates. With no exact match
 * there is no pick: the top 3 candidates come back as suggestions for `--igdb <id>`.
 */
export function pickBestMatch(query: string, candidates: GameCandidate[]): MatchResult {
  const q = normaliseName(query);
  const exact = candidates.filter((c) => normaliseName(c.name) === q).sort(byRatingCount);
  if (exact[0]) return { match: exact[0] };
  return {
    match: null,
    suggestions: [...candidates]
      .sort(byRatingCount)
      .slice(0, 3)
      .map((c) => ({
        igdbId: c.igdbId,
        name: c.name,
        year: c.firstRelease ? c.firstRelease.getUTCFullYear() : null,
      })),
  };
}
