import { buildCandidates, type CandidateDeps } from './candidates.js';
import { closestGame, sharedLabels, type ExplainProvider } from './explain.js';
import {
  bestFit,
  deviceKind,
  platformMatches,
  type DeckCategory,
  type FilterDevice,
  type FitInfo,
  type FitOptions,
  type FitRequirements,
} from './filters.js';
import { buildProfile } from './profile.js';
import { computeIdf, rankCandidates, MAX_SLOTS } from './rank.js';
import type {
  Candidate,
  EngineGame,
  FeedbackItem,
  LibraryItem,
  Recommendation,
  TasteProfile,
} from './types.js';
import { hiddenIds, isBacklog } from './visibility.js';

export interface RecommendDeps extends CandidateDeps {
  explain: ExplainProvider;
  /** Vocab id -> label; when given, each pick carries the labels it shares with its closest game. */
  labels?: Readonly<Record<string, string>>;
  now?: () => Date;
  /** Steam requirement scores for a game (null = none). Called lazily, only for PC devices. */
  fetchRequirements?(game: EngineGame): Promise<FitRequirements | null>;
  /** Steam Deck category for a Steam app. Called lazily, only for Deck devices. */
  fetchDeck?(steamAppId: number): Promise<DeckCategory>;
}

export interface RecommendInput {
  library: readonly LibraryItem[];
  feedback: readonly FeedbackItem[];
  limit: number;
  /** Filter to games these devices can run. Omit for no filtering. */
  devices?: readonly FilterDevice[];
  fitOptions?: FitOptions;
  /**
   * Rank only these library games (ids), whatever their hours: no similar or tag candidates are
   * fetched, and feedback still hides games. For "pick from my backlog".
   */
  pool?: readonly number[];
}

export type Fit = NonNullable<Recommendation['fit']>;

/**
 * The best fit of one game over `devices`, fetching Steam info only if still needed (cheapest
 * first: a console may already settle it, and a green PC makes the Deck lookup moot). A fetch
 * error counts as unknown. Null when no device can run it.
 */
export async function bestFitForGame(
  deps: RecommendDeps,
  game: EngineGame,
  devices: readonly FilterDevice[],
  opts: FitOptions,
): Promise<Fit | null> {
  const info: FitInfo = {};
  const fit = () => bestFit(game, devices, () => info, opts);
  let best = fit();
  const appId = game.steamAppId ?? null;
  if (best.status !== 'green' && appId !== null) {
    const live = devices.filter((d) => platformMatches(game, d));
    if (deps.fetchRequirements && live.some((d) => deviceKind(d) === 'pc')) {
      info.requirements = await deps.fetchRequirements(game).catch(() => null);
      best = fit();
    }
    if (best.status !== 'green' && deps.fetchDeck && live.some((d) => deviceKind(d) === 'deck')) {
      info.deck = await deps.fetchDeck(appId).catch(() => undefined);
      best = fit();
    }
  }
  if (best.status === 'hidden' || best.deviceId === null) return null;
  return { status: best.status, deviceId: best.deviceId };
}

/**
 * Walks `ranked` in order, fetching Steam info only for games that still need it, until `limit`
 * games are kept. Steam is rate limited, so never fetch ahead.
 */
export async function filterByDevices<T extends { game: EngineGame }>(
  deps: RecommendDeps,
  ranked: readonly T[],
  devices: readonly FilterDevice[],
  limit: number,
  opts: FitOptions,
): Promise<{ item: T; fit: Fit }[]> {
  const kept: { item: T; fit: Fit }[] = [];
  for (const item of ranked) {
    if (kept.length >= limit) break;
    const fit = await bestFitForGame(deps, item.game, devices, opts);
    if (fit) kept.push({ item, fit });
  }
  return kept;
}

/** One library row per game: hours add up, the latest play and status win, owned if any is, the highest rating wins. */
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
      rating: Math.max(l.rating ?? 0, prev.rating ?? 0) || null,
    });
  }
  return [...merged.values()];
}

/**
 * Games that really say something about taste (weighted, not dropped/downvoted/backlog), the
 * heaviest first: the sources for kNN scoring and for reasons.
 */
export function similaritySources(
  library: readonly LibraryItem[],
  feedback: readonly FeedbackItem[],
  profile: TasteProfile,
): EngineGame[] {
  const weight = new Map(profile.weights.map((w) => [w.igdbId, w.weight]));
  const downed = new Set(feedback.filter((f) => f.kind === 'down').map((f) => f.igdbId));
  return library
    .filter(
      (l) =>
        (weight.get(l.game.igdbId) ?? 0) > 0 &&
        l.status !== 'dropped' &&
        !downed.has(l.game.igdbId) &&
        !isBacklog(l),
    )
    .sort((a, b) => (weight.get(b.game.igdbId) ?? 0) - (weight.get(a.game.igdbId) ?? 0))
    .map((l) => l.game);
}

/** Ids of the games to roulette over: owned library games whose status is 'backlog' (one row per game). */
export function backlogPoolIds(library: readonly LibraryItem[]): number[] {
  return mergeLibrary(library)
    .filter((l) => l.owned && l.status === 'backlog')
    .map((l) => l.game.igdbId);
}

/** The pool's library games as backlog candidates, minus those the user turned down. */
function poolCandidates(
  library: readonly LibraryItem[],
  feedback: readonly FeedbackItem[],
  pool: readonly number[],
): Candidate[] {
  const wanted = new Set(pool);
  const turnedDown = new Set(feedback.filter((f) => f.kind !== 'up').map((f) => f.igdbId));
  return library
    .filter((l) => wanted.has(l.game.igdbId) && !turnedDown.has(l.game.igdbId))
    .map((l) => ({ game: l.game, backlog: true }));
}

/** Profile -> candidates -> rank + diversity -> reasons. Data access is injected via `deps`. */
export async function recommend(
  deps: RecommendDeps,
  input: RecommendInput,
): Promise<Recommendation[]> {
  const now = (deps.now ?? (() => new Date()))();
  const library = mergeLibrary(input.library);
  const profile = buildProfile({ library, feedback: input.feedback, now });
  const candidates = input.pool
    ? poolCandidates(library, input.feedback, input.pool)
    : await buildCandidates({
        profile,
        library,
        hidden: hiddenIds(library, input.feedback),
        deps,
        now,
      });
  // A backlog game is both a candidate and a library entry: count it once.
  const idfGames = new Map(
    [...candidates.map((c) => c.game), ...library.map((l) => l.game)].map((g) => [g.igdbId, g]),
  );
  const idf = computeIdf([...idfGames.values()]);
  // Sources (for kNN scoring and reasons) are games that really say something about taste.
  const similarSources = similaritySources(library, input.feedback, profile);
  const devices = input.devices?.length ? input.devices : null;
  const rankOpts = { idf, sources: similarSources, slots: MAX_SLOTS };
  const head = rankCandidates(profile, candidates, now, input.limit, rankOpts);
  // With devices, append every other candidate (ranking is cheap, fetching is not) so the walk
  // below never runs dry while candidates remain; the head keeps its source slots.
  let ranked = head;
  if (devices) {
    const seen = new Set(head.map((r) => r.game.igdbId));
    const rest = candidates.filter((c) => !seen.has(c.game.igdbId));
    ranked = [...head, ...rankCandidates(profile, rest, now, undefined, rankOpts)];
  }
  const fits = new Map<number, Fit>();
  let top = ranked.slice(0, input.limit);
  if (devices) {
    const kept = await filterByDevices(deps, ranked, devices, input.limit, input.fitOptions ?? {});
    top = kept.map((k) => k.item);
    for (const k of kept) fits.set(k.item.game.igdbId, k.fit);
  }
  const closest = top.map((t) => closestGame(t.game, similarSources, idf));
  const reasons = await deps.explain.explain(
    top.map((t, i) => ({
      game: t.game,
      profile,
      library: similarSources,
      idf,
      closest: closest[i] ?? null,
    })),
  );
  return top.map((t, i) => ({
    rank: i + 1,
    game: t.game,
    score: t.score,
    backlog: t.backlog,
    reason: reasons[i] ?? '',
    sourceGame: closest[i] ? { igdbId: closest[i].igdbId, name: closest[i].name } : null,
    ...(deps.labels && closest[i]
      ? { sharedTags: sharedLabels(t.game, closest[i], deps.labels, idf) }
      : {}),
    ...(fits.has(t.game.igdbId) ? { fit: fits.get(t.game.igdbId) } : {}),
  }));
}
