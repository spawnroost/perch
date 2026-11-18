import { closestGame } from './explain.js';
import type { FilterDevice, FitOptions } from './filters.js';
import { buildProfile } from './profile.js';
import { computeIdf, rankCandidates } from './rank.js';
import { TAG_MIN_RATING_COUNT } from './candidates.js';
import {
  filterByDevices,
  mergeLibrary,
  similaritySources,
  type Fit,
  type RecommendDeps,
} from './recommend.js';
import type { Candidate, FeedbackItem, LibraryItem, Recommendation } from './types.js';
import { hiddenIds } from './visibility.js';

/** One IGDB query feeds every page of a browse; it is the most a browse can reach. */
export const BROWSE_POOL = 300;

export interface BrowseInput {
  library: readonly LibraryItem[];
  feedback: readonly FeedbackItem[];
  /** Games must have at least one of these genres (when any are given)... */
  genres: readonly number[];
  /** ...and at least one of these themes (when any are given). */
  themes: readonly number[];
  limit: number;
  offset: number;
  /** Filter to games these devices can run. Omit for no filtering. */
  devices?: readonly FilterDevice[];
  fitOptions?: FitOptions;
}

/**
 * Browse by category: IGDB's best-rated games for the chosen genres/themes (one query), minus
 * everything the user owns or hid, ranked by the same taste score as the recommendations and run
 * through the same device filter. Returns the `offset`..`offset + limit` slice of that ranking.
 * Data access is injected via `deps`.
 */
export async function browse(
  deps: RecommendDeps,
  input: BrowseInput,
): Promise<{ items: Recommendation[]; hasMore: boolean }> {
  const { genres, themes, limit, offset } = input;
  const now = (deps.now ?? (() => new Date()))();
  const library = mergeLibrary(input.library);
  const profile = buildProfile({ library, feedback: input.feedback, now });
  // Backlog games count as owned here: browse is for finding new games.
  const hidden = hiddenIds(library, input.feedback);
  for (const l of library) if (l.owned) hidden.add(l.game.igdbId);

  const raw = await deps.queryByTags({
    genres,
    themes,
    match: 'all',
    minRatingCount: TAG_MIN_RATING_COUNT,
    limit: BROWSE_POOL,
  });
  const hasAny = (have: readonly number[], want: readonly number[]) =>
    want.length === 0 || have.some((id) => want.includes(id));
  const candidates: Candidate[] = [];
  const seen = new Set<number>();
  for (const g of raw) {
    if (seen.has(g.igdbId) || hidden.has(g.igdbId)) continue;
    if (g.firstRelease && g.firstRelease.getTime() > now.getTime()) continue;
    if (!hasAny(g.genres, genres) || !hasAny(g.themes, themes)) continue;
    seen.add(g.igdbId);
    candidates.push({ game: { ...g, vocab: deps.mapVocab(g) }, backlog: false });
  }

  const idfGames = new Map(
    [...candidates.map((c) => c.game), ...library.map((l) => l.game)].map((g) => [g.igdbId, g]),
  );
  const idf = computeIdf([...idfGames.values()]);
  const sources = similaritySources(library, input.feedback, profile);
  const ranked = rankCandidates(profile, candidates, now, undefined, { idf, sources, slots: 0 });

  // One past the page tells whether there is more.
  const want = offset + limit + 1;
  const fits = new Map<number, Fit>();
  let top = ranked.slice(0, want);
  if (input.devices?.length) {
    const kept = await filterByDevices(deps, ranked, input.devices, want, input.fitOptions ?? {});
    top = kept.map((k) => k.item);
    for (const k of kept) fits.set(k.item.game.igdbId, k.fit);
  }
  const page = top.slice(offset, offset + limit);
  const closest = page.map((t) => closestGame(t.game, sources, idf));
  const reasons = await deps.explain.explain(
    page.map((t, i) => ({
      game: t.game,
      profile,
      library: sources,
      idf,
      closest: closest[i] ?? null,
    })),
  );
  const items = page.map((t, i): Recommendation => ({
    rank: offset + i + 1,
    game: t.game,
    score: t.score,
    backlog: false,
    reason: reasons[i] ?? '',
    sourceGame: closest[i] ? { igdbId: closest[i].igdbId, name: closest[i].name } : null,
    ...(fits.has(t.game.igdbId) ? { fit: fits.get(t.game.igdbId) } : {}),
  }));
  return { items, hasMore: top.length > offset + limit };
}
