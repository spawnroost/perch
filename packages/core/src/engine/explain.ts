import { cosine } from './rank.js';
import type { EngineGame, TasteProfile } from './types.js';

export interface ExplainRequest {
  game: EngineGame;
  profile: TasteProfile;
  /** The user's library games (with vocab). */
  library: readonly EngineGame[];
  /** Per-tag idf weights; rare tags count more. Absent = all tags weigh 1. */
  idf?: Readonly<Record<string, number>>;
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
export function closestSource(
  game: EngineGame,
  library: readonly EngineGame[],
  idf?: Readonly<Record<string, number>>,
): { igdbId: number; name: string } | null {
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
  return closest ? { igdbId: closest.igdbId, name: closest.name } : null;
}

/** Template provider: "Similar to <closest library game>: <shared vocab labels>". */
export function createNoneProvider(opts: {
  labels: Readonly<Record<string, string>>;
}): ExplainProvider {
  return {
    name: 'none',
    async explain(requests) {
      return requests.map(({ game, library, idf }) => {
        const source = closestSource(game, library, idf);
        const closest = source && library.find((l) => l.igdbId === source.igdbId);
        if (!closest) return GENERIC_REASON;
        const shared = Object.entries(game.vocab)
          .map(([id, v]) => [id, v * (closest.vocab[id] ?? 0) * (idf?.[id] ?? 1)] as const)
          .filter(([, s]) => s > 0)
          .sort((a, b) => b[1] - a[1])
          .slice(0, MAX_SHARED_LABELS)
          .map(([id]) => opts.labels[id] ?? id);
        return `Similar to ${closest.name}: ${shared.join(', ')}`;
      });
    },
  };
}
