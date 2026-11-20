import type { FeedbackItem, LibraryItem, TasteProfile, WeightedGame } from './types.js';

export const HALF_LIFE_DAYS = 45;
export const MISSING_DATE_RECENCY = 0.5;
export const DROPPED_FACTOR = 0.3;
export const LAST_PLAYED_BOOST = 1.5;
export const LAST_PLAYED_COUNT = 3;
export const PROFILE_TOP_N = 15;
/** Unknown hours count as one hour: the game is in the library, so it says something. */
export const NULL_HOURS = 1;
/** Rating multipliers on the base weight; 3 and unrated are neutral. A 1 flips the sign instead. */
const RATING_FACTOR: Record<number, number> = { 2: 0.5, 3: 1, 4: 1.2, 5: 1.5 };
/** A 1 rating weighs at least this much (negative), so even an unplayed game reads as disliked. */
export const MIN_DISLIKE_WEIGHT = 0.5;
const DAY_MS = 86_400_000;

export interface ProfileInput {
  library: readonly LibraryItem[];
  feedback: readonly FeedbackItem[];
  now: Date;
}

function recency(lastPlayed: Date | null, now: Date): number {
  if (!lastPlayed) return MISSING_DATE_RECENCY;
  const days = Math.max(0, (now.getTime() - lastPlayed.getTime()) / DAY_MS);
  return 0.5 ** (days / HALF_LIFE_DAYS);
}

function rated(base: number, rating: number | null | undefined): number {
  if (rating === 1) return -Math.max(base, MIN_DISLIKE_WEIGHT);
  return base * (RATING_FACTOR[rating ?? 3] ?? 1);
}

/** Library games by weight, highest first. */
export function weighGames({ library, feedback, now }: ProfileInput): WeightedGame[] {
  const feedbackSum = new Map<number, number>();
  for (const f of feedback) {
    const delta = f.kind === 'up' ? 1 : f.kind === 'down' ? -1 : 0;
    if (delta) feedbackSum.set(f.igdbId, (feedbackSum.get(f.igdbId) ?? 0) + delta);
  }
  const recent = new Set(
    library
      .filter((l) => l.lastPlayed)
      .sort((a, b) => b.lastPlayed!.getTime() - a.lastPlayed!.getTime())
      .slice(0, LAST_PLAYED_COUNT),
  );
  return library
    .map((l): WeightedGame => {
      const hoursWeight =
        Math.log1p(Math.max(0, l.hours ?? NULL_HOURS)) *
        recency(l.lastPlayed, now) *
        (l.status === 'dropped' ? DROPPED_FACTOR : 1) *
        (recent.has(l) ? LAST_PLAYED_BOOST : 1);
      const base = rated(hoursWeight, l.rating);
      return { igdbId: l.game.igdbId, weight: base + (feedbackSum.get(l.game.igdbId) ?? 0) };
    })
    .sort((a, b) => b.weight - a.weight);
}

/** Scales to a 0-1 range by the maximum, drops non-positive entries, keeps the top n. */
function normaliseTop(sums: Map<string | number, number>, n: number): Record<string, number> {
  const entries = [...sums].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const max = entries[0]?.[1] ?? 0;
  return Object.fromEntries(entries.slice(0, n).map(([k, v]) => [k, v / max]));
}

/**
 * Taste profile from the library: per-game weights (hours x recency x status, x1.5 for the 3 most
 * recently played, x personal rating, plus feedback) applied to each game's vocab, genre and theme vectors.
 */
export function buildProfile(input: ProfileInput): TasteProfile {
  const weights = weighGames(input);
  const weightById = new Map(weights.map((w) => [w.igdbId, w.weight]));
  const vocab = new Map<string, number>();
  const genres = new Map<number, number>();
  const themes = new Map<number, number>();
  const add = <K>(m: Map<K, number>, k: K, v: number) => m.set(k, (m.get(k) ?? 0) + v);

  for (const { game } of input.library) {
    const w = weightById.get(game.igdbId) ?? 0;
    if (w === 0) continue;
    for (const [id, v] of Object.entries(game.vocab)) add(vocab, id, w * v);
    for (const id of new Set(game.genres)) add(genres, id, w);
    for (const id of new Set(game.themes)) add(themes, id, w);
  }
  return {
    vocab: normaliseTop(vocab, PROFILE_TOP_N),
    genres: normaliseTop(genres, PROFILE_TOP_N) as Record<number, number>,
    themes: normaliseTop(themes, PROFILE_TOP_N) as Record<number, number>,
    weights,
  };
}
