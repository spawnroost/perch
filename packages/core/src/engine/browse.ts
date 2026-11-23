import { closestGame } from './explain.js';
import type { FilterDevice, FitOptions } from './filters.js';
import { buildProfile } from './profile.js';
import { isFreeToPlay } from './quality.js';
import { computeIdf, rankCandidates } from './rank.js';
import { TAG_MIN_RATING_COUNT } from './candidates.js';
import {
  bestFitForGame,
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
  /** Filter to games these devices can run. Omit for no filtering. */
  devices?: readonly FilterDevice[];
  fitOptions?: FitOptions;
  /** Leave out free-to-play / gacha games (owned ones are already excluded). */
  hideFreeToPlay?: boolean;
}

export interface BrowsePage {
  items: Recommendation[];
  hasMore: boolean;
}

/** One ranked browse result that pages are cut from; a page is cheap and always the same. */
export interface BrowseList {
  page(offset: number, limit: number): Promise<BrowsePage>;
}

/**
 * Browse by category: IGDB's best-rated games for the chosen genres/themes (one query), minus
 * everything the user owns or hid, ranked by the same taste score as the recommendations. The
 * device filter runs lazily: a page only checks devices as far down the ranking as it needs
 * (offset + limit + 1 games), and later pages resume from there, so Steam is asked once per game.
 * Data access is injected via `deps`.
 */
export async function createBrowseList(
  deps: RecommendDeps,
  input: BrowseInput,
): Promise<BrowseList> {
  const { genres, themes } = input;
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
    if (input.hideFreeToPlay && isFreeToPlay(g)) continue;
    seen.add(g.igdbId);
    candidates.push({ game: { ...g, vocab: deps.mapVocab(g) }, backlog: false });
  }

  const idfGames = new Map(
    [...candidates.map((c) => c.game), ...library.map((l) => l.game)].map((g) => [g.igdbId, g]),
  );
  const idf = computeIdf([...idfGames.values()]);
  const sources = similaritySources(library, input.feedback, profile);
  const ranked = rankCandidates(profile, candidates, now, undefined, { idf, sources, slots: 0 });

  const devices = input.devices?.length ? input.devices : null;
  const kept: { item: (typeof ranked)[number]; fit?: Fit }[] = devices
    ? []
    : ranked.map((item) => ({ item }));
  let pos = 0;
  // Walks are queued, so concurrent pages never check the same game twice.
  let walking: Promise<unknown> = Promise.resolve();
  const extendTo = (count: number): Promise<unknown> => {
    if (!devices) return walking;
    const run = walking
      .catch(() => {})
      .then(async () => {
        while (kept.length < count && pos < ranked.length) {
          const item = ranked[pos]!;
          const fit = await bestFitForGame(deps, item.game, devices, input.fitOptions ?? {});
          pos++;
          if (fit) kept.push({ item, fit });
        }
      });
    walking = run;
    return run;
  };

  return {
    async page(offset, limit) {
      // One past the page tells whether there is more.
      await extendTo(offset + limit + 1);
      const slice = kept.slice(offset, offset + limit);
      const closest = slice.map(({ item }) => closestGame(item.game, sources, idf));
      const reasons = await deps.explain.explain(
        slice.map(({ item }, i) => ({
          game: item.game,
          profile,
          library: sources,
          idf,
          closest: closest[i] ?? null,
        })),
      );
      const items = slice.map(({ item, fit }, i): Recommendation => ({
        rank: offset + i + 1,
        game: item.game,
        score: item.score,
        backlog: false,
        reason: reasons[i] ?? '',
        sourceGame: closest[i] ? { igdbId: closest[i].igdbId, name: closest[i].name } : null,
        ...(fit ? { fit } : {}),
      }));
      return { items, hasMore: kept.length > offset + limit };
    },
  };
}

/** One page of `createBrowseList`. */
export async function browse(
  deps: RecommendDeps,
  input: BrowseInput & { limit: number; offset: number },
): Promise<BrowsePage> {
  return (await createBrowseList(deps, input)).page(input.offset, input.limit);
}
