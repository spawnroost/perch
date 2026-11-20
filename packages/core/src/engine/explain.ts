import { cosine } from './rank.js';
import type { EngineGame, TasteProfile } from './types.js';

export interface ExplainRequest {
  game: EngineGame;
  profile: TasteProfile;
  /** The user's library games (with vocab). */
  library: readonly EngineGame[];
  /** Per-tag idf weights; rare tags count more. Absent = all tags weigh 1. */
  idf?: Readonly<Record<string, number>>;
  /** The library game closest to `game`, when the caller already found it (null = none). Absent = provider searches. */
  closest?: EngineGame | null;
}

/** Turns ranked games into one short reason each; results are in request order. */
export interface ExplainProvider {
  readonly name: string;
  explain(requests: readonly ExplainRequest[]): Promise<string[]>;
}

export const MAX_SHARED_LABELS = 3;
/** Fallback reason when no library game is similar to the candidate. */
export const GENERIC_REASON = 'Matches your overall taste profile';

/** The library game most similar to `game` (never itself); null when none shares any vocab. */
export function closestGame(
  game: EngineGame,
  library: readonly EngineGame[],
  idf?: Readonly<Record<string, number>>,
): EngineGame | null {
  let closest: EngineGame | undefined;
  let best = 0;
  for (const lib of library) {
    if (lib.igdbId === game.igdbId) continue; // a backlog game is not similar to itself
    const sim = cosine(game.vocab, lib.vocab, idf);
    if (sim > best) {
      best = sim;
      closest = lib;
    }
  }
  return closest ?? null;
}

/** `closestGame`, trimmed to what a recommendation exposes. */
export function closestSource(
  game: EngineGame,
  library: readonly EngineGame[],
  idf?: Readonly<Record<string, number>>,
): { igdbId: number; name: string } | null {
  const closest = closestGame(game, library, idf);
  return closest ? { igdbId: closest.igdbId, name: closest.name } : null;
}

/** Top shared vocab labels of two games, strongest (idf-weighted) first. */
export function sharedLabels(
  a: EngineGame,
  b: EngineGame,
  labels: Readonly<Record<string, string>>,
  idf?: Readonly<Record<string, number>>,
): string[] {
  return Object.entries(a.vocab)
    .map(([id, v]) => [id, v * (b.vocab[id] ?? 0) * (idf?.[id] ?? 1)] as const)
    .filter(([, s]) => s > 0)
    .sort((x, y) => y[1] - x[1])
    .slice(0, MAX_SHARED_LABELS)
    .map(([id]) => labels[id] ?? id);
}

/** "Like <seed>: <shared vocab labels>" for a "more like this" pick; just the name if none shared. */
export function likeReason(
  seed: EngineGame,
  game: EngineGame,
  opts: { labels: Readonly<Record<string, string>>; idf?: Readonly<Record<string, number>> },
): string {
  const shared = sharedLabels(game, seed, opts.labels, opts.idf);
  return shared.length > 0 ? `Like ${seed.name}: ${shared.join(', ')}` : `Like ${seed.name}`;
}

/** Template provider: "Similar to <closest library game>: <shared vocab labels>". */
export function createNoneProvider(opts: {
  labels: Readonly<Record<string, string>>;
}): ExplainProvider {
  return {
    name: 'none',
    async explain(requests) {
      return requests.map(({ game, library, idf, closest: given }) => {
        const closest = given === undefined ? closestGame(game, library, idf) : given;
        if (!closest) return GENERIC_REASON;
        const shared = sharedLabels(game, closest, opts.labels, idf);
        return `Similar to ${closest.name}: ${shared.join(', ')}`;
      });
    },
  };
}
