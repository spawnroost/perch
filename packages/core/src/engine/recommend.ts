import { buildCandidates, type CandidateDeps } from './candidates.js';
import type { ExplainProvider } from './explain.js';
import { buildProfile } from './profile.js';
import { rankCandidates } from './rank.js';
import type { FeedbackItem, LibraryItem, Recommendation } from './types.js';
import { hiddenIds, isBacklog } from './visibility.js';

export interface RecommendDeps extends CandidateDeps {
  explain: ExplainProvider;
  now?: () => Date;
}

export interface RecommendInput {
  library: readonly LibraryItem[];
  feedback: readonly FeedbackItem[];
  limit: number;
}

/** One library row per game: hours add up, the latest play and status win, owned if any is. */
export function mergeLibrary(library: readonly LibraryItem[]): LibraryItem[] {
  const merged = new Map<number, LibraryItem>();
  for (const l of library) {
    const prev = merged.get(l.game.igdbId);
    if (!prev) {
      merged.set(l.game.igdbId, { ...l });
      continue;
    }
    const newer = (l.lastPlayed?.getTime() ?? 0) > (prev.lastPlayed?.getTime() ?? 0);
    merged.set(l.game.igdbId, {
      game: prev.game,
      hours: prev.hours === null && l.hours === null ? null : (prev.hours ?? 0) + (l.hours ?? 0),
      lastPlayed: newer ? l.lastPlayed : prev.lastPlayed,
      status: newer ? l.status : prev.status,
      owned: prev.owned || l.owned,
    });
  }
  return [...merged.values()];
}

/** Profile -> candidates -> rank + diversity -> reasons. Data access is injected via `deps`. */
export async function recommend(
  deps: RecommendDeps,
  input: RecommendInput,
): Promise<Recommendation[]> {
  const now = (deps.now ?? (() => new Date()))();
  const library = mergeLibrary(input.library);
  const profile = buildProfile({ library, feedback: input.feedback, now });
  const candidates = await buildCandidates({
    profile,
    library,
    hidden: hiddenIds(library, input.feedback),
    deps,
    now,
  });
  const top = rankCandidates(profile, candidates, now, input.limit).slice(0, input.limit);
  // Reasons only cite games that really say something about the user's taste.
  const weight = new Map(profile.weights.map((w) => [w.igdbId, w.weight]));
  const downed = new Set(input.feedback.filter((f) => f.kind === 'down').map((f) => f.igdbId));
  const similarSources = library
    .filter(
      (l) =>
        (weight.get(l.game.igdbId) ?? 0) > 0 &&
        l.status !== 'dropped' &&
        !downed.has(l.game.igdbId) &&
        !isBacklog(l),
    )
    .map((l) => l.game);
  const reasons = await deps.explain.explain(
    top.map((t) => ({ game: t.game, profile, library: similarSources })),
  );
  return top.map((t, i) => ({
    rank: i + 1,
    game: t.game,
    score: t.score,
    backlog: t.backlog,
    reason: reasons[i] ?? '',
  }));
}
