import type { Db, games } from '@perch/db';
import type { IgdbCache } from '../igdb/cache.js';
import type { Game } from '../igdb/schemas.js';
import type { SteamClient } from '../requirements/steam.js';
import { GENERIC_REASON, createNoneProvider } from './explain.js';
import {
  deviceFit,
  deviceKind,
  platformMatches,
  type DeckCategory,
  type FitRequirements,
  type FitStatus,
} from './filters.js';
import { createFitFetchers, loadDevices, loadRecommendInput } from './load.js';
import { buildProfile } from './profile.js';
import { computeIdf } from './rank.js';
import { mergeLibrary, recommend, similaritySources } from './recommend.js';
import { selectDevices } from '../devices/store.js';
import type { Recommendation, Vocab } from './types.js';

export interface UserEngineDeps {
  db: Db;
  cache: Pick<IgdbCache, 'getGames' | 'queryByTags'>;
  /** Taste-vocab mapper and labels, injected so core does not depend on taste-vocab. */
  mapVocab: (game: Game & Partial<typeof games.$inferSelect>) => Vocab;
  labels: Readonly<Record<string, string>>;
  /** Overrides the Steam client (tests). */
  steam?: SteamClient;
}

/**
 * The user's recommendations, as `perch recommend`: filtered by `device` (undefined or 'all' =
 * every device, 'none' = no filtering, else a device id or preset id). Writes nothing.
 */
export async function recommendForUser(
  deps: UserEngineDeps,
  userId: string,
  opts: { device?: string; limit: number },
): Promise<Recommendation[]> {
  const { db, cache, mapVocab, labels, steam } = deps;
  const { library, feedback } = await loadRecommendInput(db, userId, mapVocab);
  const devices = selectDevices(await loadDevices(db, userId), opts.device);
  return recommend(
    {
      getGames: (ids) => cache.getGames(ids),
      queryByTags: (q) => cache.queryByTags(q),
      mapVocab,
      ...createFitFetchers(db, steam),
      explain: createNoneProvider({ labels }),
    },
    { library, feedback, limit: opts.limit, devices },
  );
}

/** Why the engine would pick this game for the user: empty when the library says nothing yet. */
export async function explainGameForUser(
  deps: Pick<UserEngineDeps, 'db' | 'mapVocab' | 'labels'>,
  userId: string,
  game: Game,
): Promise<string[]> {
  const { db, mapVocab, labels } = deps;
  const { library: raw, feedback } = await loadRecommendInput(db, userId, mapVocab);
  const library = mergeLibrary(raw);
  const profile = buildProfile({ library, feedback, now: new Date() });
  const sources = similaritySources(library, feedback, profile);
  if (sources.length === 0) return [];
  const engineGame = { ...game, vocab: mapVocab(game) };
  const idf = computeIdf([engineGame, ...sources]);
  const [reason] = await createNoneProvider({ labels }).explain([
    { game: engineGame, profile, library: sources, idf },
  ]);
  // The generic fallback means nothing in the library is similar: say nothing.
  return reason && reason !== GENERIC_REASON ? [reason] : [];
}

export interface GameFit {
  deck: DeckCategory | null;
  fits: { deviceId: string; deviceName: string; status: FitStatus }[];
}

/**
 * Will-it-run per device. Steam lookups only happen when a device needs them; a failed lookup
 * leaves the status 'unknown' instead of failing the request.
 */
export async function gameFitForUser(
  deps: Pick<UserEngineDeps, 'db' | 'steam'>,
  userId: string,
  game: Pick<Game, 'igdbId' | 'platforms' | 'steamAppId'>,
): Promise<GameFit> {
  const devices = await loadDevices(deps.db, userId);
  const { fetchRequirements, fetchDeck } = createFitFetchers(deps.db, deps.steam);
  const appId = game.steamAppId;
  const live = devices.filter((d) => platformMatches(game, d));
  let deck: DeckCategory | null = null;
  let requirements: FitRequirements | null | undefined;
  if (appId !== null) {
    const needsDeck = devices.some((d) => deviceKind(d) === 'deck');
    const needsRequirements = live.some((d) => deviceKind(d) === 'pc');
    [deck, requirements] = await Promise.all([
      needsDeck ? fetchDeck(appId).catch(() => null) : Promise.resolve(null),
      needsRequirements ? fetchRequirements(game).catch(() => null) : Promise.resolve(undefined),
    ]);
  }
  return {
    deck,
    fits: devices.map((d) => ({
      deviceId: d.id,
      deviceName: d.name,
      status: deviceFit(game, d, { requirements, deck: deck ?? undefined }),
    })),
  };
}
