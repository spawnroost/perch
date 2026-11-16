import type { Candidate, EngineGame, TasteProfile, Vocab } from './types.js';

export const W_COSINE = 0.6;
export const W_RATING = 0.2;
export const BACKLOG_BONUS = 0.15;
export const MAX_RECENCY_BOOST = 0.05;
/** The release-recency boost fades to 0 over this many years. */
export const RECENCY_YEARS = 10;
export const DIVERSITY_WINDOW = 5;
export const DIVERSITY_MAX_SAME = 2;
/** With a limit, diversify only this many times the limit. */
export const DIVERSITY_POOL_FACTOR = 3;
/** IGDB genre ids that say nothing about the kind of game (Indie). */
const GENERIC_GENRES = new Set([32]);
const YEAR_MS = 365.25 * 86_400_000;

/** Smoothed inverse document frequency per vocab tag: ln((N+1)/(df+1)) + 1, df = games with tag > 0. */
export function computeIdf(games: readonly { vocab: Vocab }[]): Record<string, number> {
  const df: Record<string, number> = {};
  for (const g of games) {
    for (const [k, v] of Object.entries(g.vocab)) if (v > 0) df[k] = (df[k] ?? 0) + 1;
  }
  const n = games.length;
  return Object.fromEntries(
    Object.entries(df).map(([k, d]) => [k, Math.log((n + 1) / (d + 1)) + 1]),
  );
}

/** Cosine similarity; with `idf`, every entry is first multiplied by its tag's idf (default 1). */
export function cosine(a: Vocab, b: Vocab, idf?: Readonly<Record<string, number>>): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const [k, v] of Object.entries(a)) {
    const x = v * (idf?.[k] ?? 1);
    na += x * x;
    const w = b[k];
    if (w) dot += x * w * (idf?.[k] ?? 1);
  }
  for (const [k, v] of Object.entries(b)) {
    const y = v * (idf?.[k] ?? 1);
    nb += y * y;
  }
  return na === 0 || nb === 0 ? 0 : dot / Math.sqrt(na * nb);
}

export function scoreCandidate(
  profile: TasteProfile,
  c: Candidate,
  now: Date,
  idf?: Readonly<Record<string, number>>,
): number {
  const { game } = c;
  let recency = 0;
  if (game.firstRelease) {
    const years = Math.max(0, (now.getTime() - game.firstRelease.getTime()) / YEAR_MS);
    recency = MAX_RECENCY_BOOST * Math.max(0, 1 - years / RECENCY_YEARS);
  }
  return (
    cosine(profile.vocab, game.vocab, idf) * W_COSINE +
    ((game.rating ?? 0) / 100) * W_RATING +
    (c.backlog ? BACKLOG_BONUS : 0) +
    recency
  );
}

export function primaryGenre(game: Pick<EngineGame, 'genres'>): number | undefined {
  return game.genres.find((g) => !GENERIC_GENRES.has(g));
}

/**
 * Greedy re-order of a score-sorted list: at each position take the best remaining item that
 * keeps at most 2 of one primary genre in the last 5; if none does, take the best remaining.
 */
export function diversify<T extends { game: Pick<EngineGame, 'genres'> }>(
  sorted: readonly T[],
  window = DIVERSITY_WINDOW,
  maxSame = DIVERSITY_MAX_SAME,
): T[] {
  const rest = [...sorted];
  const out: T[] = [];
  while (rest.length > 0) {
    const recent = (window > 1 ? out.slice(-(window - 1)) : []).map((o) => primaryGenre(o.game));
    let pick = rest.findIndex((r) => {
      const g = primaryGenre(r.game);
      return g === undefined || recent.filter((x) => x === g).length < maxSame;
    });
    if (pick < 0) pick = 0;
    out.push(...rest.splice(pick, 1));
  }
  return out;
}

export interface RankedCandidate extends Candidate {
  score: number;
}

/**
 * Scores every candidate, sorts best first, then applies the diversity rule. With `limit`, only
 * the top limit x 3 are diversified and returned (the greedy pass is quadratic).
 */
export function rankCandidates(
  profile: TasteProfile,
  candidates: readonly Candidate[],
  now: Date,
  limit?: number,
  idf?: Readonly<Record<string, number>>,
): RankedCandidate[] {
  const scored = candidates
    .map((c) => ({ ...c, score: scoreCandidate(profile, c, now, idf) }))
    .sort((a, b) => b.score - a.score);
  return diversify(limit === undefined ? scored : scored.slice(0, limit * DIVERSITY_POOL_FACTOR));
}
