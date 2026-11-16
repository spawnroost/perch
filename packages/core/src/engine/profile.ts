import type { FeedbackItem, LibraryItem, TasteProfile, WeightedGame } from './types.js';

export const HALF_LIFE_DAYS = 45;
export const MISSING_DATE_RECENCY = 0.5;
export const DROPPED_FACTOR = 0.3;
export const LAST_PLAYED_BOOST = 1.5;
export const LAST_PLAYED_COUNT = 3;
export const PROFILE_TOP_N = 15;
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
      const base =
        Math.log1p(Math.max(0, l.hours ?? 0)) *
        recency(l.lastPlayed, now) *
        (l.status === 'dropped' ? DROPPED_FACTOR : 1) *
        (recent.has(l) ? LAST_PLAYED_BOOST : 1);
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
 * recently played, plus feedback) applied to each game's vocab, genre and theme vectors.
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
