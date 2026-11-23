import type { TagQuery } from '../igdb/client.js';
import { IGDB_PLATFORM } from '../devices/presets.js';
import { isBacklog } from './visibility.js';
import { meetsQualityFloor, MOBILE_MIN_RATING_COUNT } from './quality.js';
import type { Candidate, EngineGame, LibraryItem, RawGame, TasteProfile, Vocab } from './types.js';

export const CANDIDATE_CAP = 300;
export const SIMILAR_FROM_TOP = 25;
export const TAG_TOP = 3;
export const TAG_MIN_RATING_COUNT = 50;
export const TAG_LIMIT = 100;
export const MOBILE_TAG_LIMIT = 50;
const MOBILE_PLATFORMS: readonly number[] = [IGDB_PLATFORM.ios, IGDB_PLATFORM.android];

export interface CandidateDeps {
  getGames(ids: readonly number[]): Promise<RawGame[]>;
  queryByTags(q: TagQuery): Promise<RawGame[]>;
  /** Taste-vocab mapper, injected so core does not depend on taste-vocab. */
  mapVocab(game: RawGame): Vocab;
}

export interface CandidateInput {
  profile: TasteProfile;
  library: readonly LibraryItem[];
  /** Ids that must not appear (see `hiddenIds`). */
  hidden: ReadonlySet<number>;
  deps: CandidateDeps;
  now: Date;
  /** IGDB platform ids of the user's devices; a mobile one adds a mobile-only tag query. */
  platformIds?: readonly number[];
}

const topKeys = (rec: Record<number, number>, n: number): number[] =>
  Object.entries(rec)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k]) => Number(k));

/**
 * Candidate pool: the user's backlog, `similar_games` of the 10 heaviest library games (those
 * recommended by several first), and IGDB's best-rated games for the top genres/themes.
 * Mobile-only games must pass the quality floor. With a mobile device, a mobile-platform tag
 * query is added. Deduped and capped at 300; backlog games are never cut.
 */
export async function buildCandidates(input: CandidateInput): Promise<Candidate[]> {
  const { profile, library, hidden, deps, now, platformIds = [] } = input;
  const inLibrary = new Set(library.map((l) => l.game.igdbId));
  const byId = new Map(library.map((l) => [l.game.igdbId, l.game]));

  const backlog: Candidate[] = library
    .filter((l) => isBacklog(l) && !hidden.has(l.game.igdbId))
    .map((l) => ({ game: l.game, backlog: true }));

  // similar_games votes, strongest-weighted source games first.
  const votes = new Map<number, number>();
  for (const { igdbId, weight } of profile.weights.slice(0, SIMILAR_FROM_TOP)) {
    if (weight <= 0) continue;
    for (const id of new Set(byId.get(igdbId)?.similarIds ?? [])) {
      if (!inLibrary.has(id) && !hidden.has(id)) votes.set(id, (votes.get(id) ?? 0) + 1);
    }
  }
  const similarIds = [...votes].sort((a, b) => b[1] - a[1]).map(([id]) => id);

  const genres = topKeys(profile.genres, TAG_TOP);
  const themes = topKeys(profile.themes, TAG_TOP);
  // One after the other: both upsert into `games`, and concurrent multi-row upserts that
  // overlap in different orders can deadlock Postgres.
  const similar = similarIds.length > 0 ? await deps.getGames(similarIds) : [];
  const tagged =
    genres.length + themes.length > 0
      ? await deps.queryByTags({
          genres,
          themes,
          minRatingCount: TAG_MIN_RATING_COUNT,
          limit: TAG_LIMIT,
        })
      : [];
  // Mobile games rarely reach the top of an all-platform ranking, so ask for them directly.
  const mobilePlatforms = MOBILE_PLATFORMS.filter((p) => platformIds.includes(p));
  const mobile =
    mobilePlatforms.length > 0 && genres.length + themes.length > 0
      ? await deps.queryByTags({
          genres,
          themes,
          platforms: mobilePlatforms,
          minRatingCount: MOBILE_MIN_RATING_COUNT,
          limit: MOBILE_TAG_LIMIT,
        })
      : [];

  const out = [...backlog];
  const seen = new Set(out.map((c) => c.game.igdbId));
  const released = (g: RawGame) => !g.firstRelease || g.firstRelease.getTime() <= now.getTime();
  for (const raw of [...similar, ...tagged, ...mobile]) {
    if (out.length >= CANDIDATE_CAP) break;
    if (seen.has(raw.igdbId) || inLibrary.has(raw.igdbId) || hidden.has(raw.igdbId)) continue;
    if (!released(raw) || !meetsQualityFloor(raw)) continue;
    seen.add(raw.igdbId);
    const game: EngineGame = { ...raw, vocab: deps.mapVocab(raw) };
    out.push({ game, backlog: false });
  }
  return out;
}
