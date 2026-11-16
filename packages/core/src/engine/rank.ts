import type { Candidate, EngineGame, TasteProfile, Vocab } from './types.js';

export const W_COSINE = 0.6;
/** Taste match = W_CENTROID x profile cosine + W_KNN x best cosine to one source library game. */
export const W_CENTROID = 0.5;
export const W_KNN = 0.5;
/** Max slots for sources (heaviest first) with no match in the list. */
export const MAX_SLOTS = 5;
export const W_RATING = 0.2;
export const BACKLOG_BONUS = 0.15;
export const MAX_RECENCY_BOOST = 0.05;
/** The release-recency boost fades to 0 over this many years. */
export const RECENCY_YEARS = 10;
export const DIVERSITY_WINDOW = 5;
export const DIVERSITY_MAX_SAME = 2;
/** With a limit, diversify only this many times the limit. */
export const DIVERSITY_POOL_FACTOR = 3;
/** At most this many games of one series (IGDB collection / franchise) in the top `limit`. */
export const MAX_PER_SERIES = 2;
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

export interface ScoreOptions {
  idf?: Readonly<Record<string, number>>;
  /** Library games that speak for the user's taste; a close match to any one of them counts. */
  sources?: readonly { vocab: Vocab }[];
  /** With a limit: at most this many unshown sources (in source order) get a slot. */
  slots?: number;
}

/**
 * Centroid cosine blended with item-kNN (max cosine to any source game), so a light taste
 * cluster (a short FPS among long RPGs) can still surface its matches. No sources: centroid only.
 */
export function tasteMatch(profile: TasteProfile, game: { vocab: Vocab }, opts: ScoreOptions = {}) {
  const { idf, sources = [] } = opts;
  const centroid = cosine(profile.vocab, game.vocab, idf);
  if (sources.length === 0) return centroid;
  const knn = Math.max(...sources.map((s) => cosine(s.vocab, game.vocab, idf)));
  return W_CENTROID * centroid + W_KNN * knn;
}

export function scoreCandidate(
  profile: TasteProfile,
  c: Candidate,
  now: Date,
  opts: ScoreOptions = {},
): number {
  const { game } = c;
  let recency = 0;
  if (game.firstRelease) {
    const years = Math.max(0, (now.getTime() - game.firstRelease.getTime()) / YEAR_MS);
    recency = MAX_RECENCY_BOOST * Math.max(0, 1 - years / RECENCY_YEARS);
  }
  return (
    tasteMatch(profile, game, opts) * W_COSINE +
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

/** Index of the source game closest to `game` (idf-weighted cosine), or undefined. */
export function closestSource(game: { vocab: Vocab }, opts: ScoreOptions): number | undefined {
  let best: number | undefined;
  let bestSim = 0;
  (opts.sources ?? []).forEach((s, i) => {
    const sim = cosine(s.vocab, game.vocab, opts.idf);
    if (sim > bestSim) [best, bestSim] = [i, sim];
  });
  return best;
}

/**
 * Series cap: walking `list` in order, a game that shares a series id with MAX_PER_SERIES games
 * already placed in the top `limit` is moved below it and the next eligible game moves up. Games
 * with no series are never capped. `pinned` games (slot picks) count toward the cap but are never
 * moved. If too few eligible games remain, the best deferred ones fill the head.
 */
export function capSeries<T extends { game: Pick<EngineGame, 'series'> }>(
  list: readonly T[],
  limit: number,
  pinned: ReadonlySet<T> = new Set(),
): T[] {
  const count = new Map<number, number>();
  const bump = (g: T) => {
    for (const id of g.game.series) count.set(id, (count.get(id) ?? 0) + 1);
  };
  for (const p of pinned) bump(p);
  const full = (g: T) => g.game.series.some((id) => (count.get(id) ?? 0) >= MAX_PER_SERIES);
  const head: T[] = [];
  const rest: T[] = [];
  for (const g of list) {
    if (head.length < limit && (pinned.has(g) || !full(g))) {
      head.push(g);
      if (!pinned.has(g)) bump(g);
    } else {
      rest.push(g);
    }
  }
  // Not enough eligible games: keep the head full with the best deferred ones.
  const fill = rest.splice(0, Math.max(0, limit - head.length));
  return [...head, ...fill, ...rest];
}

export interface RankedCandidate extends Candidate {
  score: number;
}

/** Best-scoring match per source game (by closest source), keyed by source index. */
export function bestPerSource<T extends Candidate>(
  scored: readonly T[],
  opts: ScoreOptions,
): Map<number, T> {
  const best = new Map<number, T>();
  for (const c of scored) {
    const src = closestSource(c.game, opts);
    if (src !== undefined && !best.has(src)) best.set(src, c);
  }
  return best;
}

/**
 * Scores every candidate, sorts best first, then applies the diversity rule. With `limit`, only
 * the top limit x 3 are diversified and returned (the greedy pass is quadratic). Then up to
 * `slots` sources with no match inside the limit (heaviest first) get their best match moved in,
 * replacing the lowest items, so a light taste cluster still shows. Last, the series cap
 * (MAX_PER_SERIES per series in the top `limit`) is enforced.
 */
export function rankCandidates(
  profile: TasteProfile,
  candidates: readonly Candidate[],
  now: Date,
  limit?: number,
  opts: ScoreOptions = {},
): RankedCandidate[] {
  const scored = candidates
    .map((c) => ({ ...c, score: scoreCandidate(profile, c, now, opts) }))
    .sort((a, b) => b.score - a.score);
  if (limit === undefined) return diversify(scored);
  const ranked = diversify(scored.slice(0, limit * DIVERSITY_POOL_FACTOR));
  const head = ranked.slice(0, limit);
  const shown = new Set(head.map((r) => closestSource(r.game, opts)));
  const missing = [...bestPerSource(scored, opts)]
    .sort((a, b) => a[0] - b[0])
    .filter(([src]) => !shown.has(src))
    .slice(0, Math.min(opts.slots ?? 0, limit))
    .map(([, c]) => c);
  if (missing.length === 0) return capSeries(ranked, limit);
  const kept = head.slice(0, limit - missing.length);
  const placed = new Set([...kept, ...missing]);
  const slotted = [...kept, ...missing, ...ranked.filter((r) => !placed.has(r))];
  return capSeries(slotted, limit, new Set(missing));
}
