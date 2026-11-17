import { buildCandidates } from './candidates.js';
import { likeReason } from './explain.js';
import type { FilterDevice, FitOptions } from './filters.js';
import { computeIdf, rankCandidates } from './rank.js';
import { filterByDevices, type Fit, type RecommendDeps } from './recommend.js';
import type {
  EngineGame,
  FeedbackItem,
  LibraryItem,
  Recommendation,
  TasteProfile,
} from './types.js';
import { hiddenIds } from './visibility.js';

export const SIMILAR_LIMIT = 24;

export interface SimilarInput {
  /** The game to find more of (its vocab already computed). */
  game: EngineGame;
  library: readonly LibraryItem[];
  feedback: readonly FeedbackItem[];
  /** Vocab id -> label, for the reason. */
  labels: Readonly<Record<string, string>>;
  limit?: number;
  /** Filter to games these devices can run. Omit for no filtering. */
  devices?: readonly FilterDevice[];
  fitOptions?: FitOptions;
}

/** A profile made of one game, so candidate building and ranking aim at it alone. */
function seedProfile(game: EngineGame): TasteProfile {
  const ones = (ids: readonly number[]) => Object.fromEntries(ids.map((id) => [id, 1]));
  return {
    vocab: game.vocab,
    genres: ones(game.genres),
    themes: ones(game.themes),
    weights: [{ igdbId: game.igdbId, weight: 1 }],
  };
}

/**
 * "More like this": candidates (the game's `similar_games` plus IGDB's best for its genres and
 * themes) ranked by idf-weighted vocab cosine to that one game instead of the user's profile.
 * The game itself, the whole library (backlog too) and hidden games never appear; the device
 * filter is as in `recommend`. Data access is injected via `deps`.
 */
export async function similarTo(
  deps: RecommendDeps,
  input: SimilarInput,
): Promise<Recommendation[]> {
  const { game: seed, labels } = input;
  const limit = input.limit ?? SIMILAR_LIMIT;
  const now = (deps.now ?? (() => new Date()))();
  const hidden = hiddenIds(input.library, input.feedback);
  for (const l of input.library) hidden.add(l.game.igdbId);
  hidden.add(seed.igdbId);
  const profile = seedProfile(seed);
  // The seed stands alone as the "library": similar_games votes come from it, and it is never
  // a backlog candidate. The real library is excluded through `hidden`.
  const candidates = await buildCandidates({
    profile,
    library: [{ game: seed, hours: 1, lastPlayed: null, status: 'finished', owned: false }],
    hidden,
    deps,
    now,
  });
  const idf = computeIdf([seed, ...candidates.map((c) => c.game)]);
  // Cosine to the seed is the taste match (centroid = seed = the only source); no slots.
  const rankOpts = { idf, sources: [seed], slots: 0 };
  const ranked = rankCandidates(profile, candidates, now, undefined, rankOpts).filter(
    (r) => (r.sim ?? 0) > 0,
  );
  const devices = input.devices?.length ? input.devices : null;
  const fits = new Map<number, Fit>();
  let top = ranked.slice(0, limit);
  if (devices) {
    const kept = await filterByDevices(deps, ranked, devices, limit, input.fitOptions ?? {});
    top = kept.map((k) => k.item);
    for (const k of kept) fits.set(k.item.game.igdbId, k.fit);
  }
  return top.map((t, i) => ({
    rank: i + 1,
    game: t.game,
    score: t.score,
    backlog: false,
    reason: likeReason(seed, t.game, { labels, idf }),
    sourceGame: { igdbId: seed.igdbId, name: seed.name },
    ...(fits.has(t.game.igdbId) ? { fit: fits.get(t.game.igdbId) } : {}),
  }));
}
