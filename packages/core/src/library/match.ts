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

const mostRated = (list: GameCandidate[]): GameCandidate | null =>
  list.reduce<GameCandidate | null>(
    (best, c) => (!best || c.ratingCount > best.ratingCount ? c : best),
    null,
  );

/** Exact (normalised) name match first, then highest rating count; falls back to all candidates. */
export function pickBestMatch(query: string, candidates: GameCandidate[]): GameCandidate | null {
  const q = normaliseName(query);
  const exact = candidates.filter((c) => normaliseName(c.name) === q);
  return mostRated(exact.length > 0 ? exact : candidates);
}
