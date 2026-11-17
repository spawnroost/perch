import type { Db, games } from '@perch/db';
import type { IgdbCache } from '../igdb/cache.js';
import type { Game } from '../igdb/schemas.js';
import type { SteamClient } from '../requirements/steam.js';
import { loadTimeToBeat, type TimeToBeatHours } from '../igdb/time-to-beat.js';
import { GENERIC_REASON, createNoneProvider } from './explain.js';
import {
  deviceFitDetail,
  deviceKind,
  platformMatches,
  type DeckCategory,
  type FilterDevice,
  type FitRequirements,
  type FitStatus,
} from './filters.js';
import { createFitFetchers, loadDevices, loadRecommendInput } from './load.js';
import { buildProfile } from './profile.js';
import { computeIdf } from './rank.js';
import { mergeLibrary, recommend, similaritySources } from './recommend.js';
import { batteryMatters, rankForSession, type SessionRanked } from './session.js';
import { selectDevices } from '../devices/store.js';
import type { Recommendation, Vocab } from './types.js';

export interface UserEngineDeps {
  db: Db;
  cache: Pick<IgdbCache, 'getGames' | 'queryByTags' | 'warmTimeToBeat'>;
  /** Taste-vocab mapper and labels, injected so core does not depend on taste-vocab. */
  mapVocab: (game: Game & Partial<typeof games.$inferSelect>) => Vocab;
  labels: Readonly<Record<string, string>>;
  /** Overrides the Steam client (tests). */
  steam?: SteamClient;
}

export interface DeviceFit {
  deviceId: string;
  deviceName: string;
  status: FitStatus;
  /** Why the device got this status (from the will-it-run result). */
  reason: string;
}

export interface GameFit {
  deck: DeckCategory | null;
  fits: DeviceFit[];
  /** GPU score the game recommends (else its minimum); null when Steam requirements are unknown. */
  gpuRequirement: number | null;
}

export type UserRecommendation = Recommendation &
  GameFit & {
    coverUrl: string | null;
    coverUrlSmall: string | null;
    heroUrl: string | null;
    accent: string | null;
    /** Only what is already in the DB; null when none or too few submissions. */
    timeToBeat: TimeToBeatHours | null;
  };

/**
 * The user's recommendations, as `perch recommend`: filtered by `device` (undefined or 'all' =
 * every device, 'none' = no filtering, else a device id or preset id). Every pick also carries
 * its fit on all of the user's devices. Writes nothing.
 */
export async function recommendForUser(
  deps: UserEngineDeps,
  userId: string,
  opts: {
    device?: string;
    limit: number;
    withGpuRequirements?: boolean;
    /** Fetch missing time-to-beat for the picks in the background (off the request path). */
    warmTimeToBeat?: boolean;
  },
): Promise<UserRecommendation[]> {
  const { db, cache, mapVocab, labels, steam } = deps;
  const { library, feedback } = await loadRecommendInput(db, userId, mapVocab);
  const allDevices = await loadDevices(db, userId);
  const fetchers = createFitFetchers(db, steam);
  const recs = await recommend(
    {
      getGames: (ids) => cache.getGames(ids),
      queryByTags: (q) => cache.queryByTags(q),
      mapVocab,
      ...fetchers,
      explain: createNoneProvider({ labels }),
    },
    { library, feedback, limit: opts.limit, devices: selectDevices(allDevices, opts.device) },
  );
  // The picks are cached by now, so this is one DB read.
  const ids = recs.map((r) => r.game.igdbId);
  if (opts.warmTimeToBeat) cache.warmTimeToBeat(ids);
  const [full, ttb] = await Promise.all([cache.getGames(ids), loadTimeToBeat(db, ids)]);
  const byId = new Map(full.map((g) => [g.igdbId, g]));
  return Promise.all(
    recs.map(async (rec) => {
      const game = byId.get(rec.game.igdbId);
      return {
        ...rec,
        coverUrl: game?.coverUrl ?? null,
        coverUrlSmall: game?.coverUrlSmall ?? null,
        heroUrl: game?.heroUrl ?? null,
        accent: game?.accent ?? null,
        timeToBeat: ttb.get(rec.game.igdbId) ?? null,
        ...(await fitsForGame(allDevices, fetchers, game ?? rec.game, opts.withGpuRequirements)),
      };
    }),
  );
}

/** Session picks: the user's recommendations re-ranked for `minutes` of play on one device. */
export async function sessionForUser(
  deps: UserEngineDeps,
  userId: string,
  q: { minutes: number; battery?: number; deviceId?: string },
  limit = 20,
): Promise<SessionRanked<UserRecommendation>[]> {
  const all = await loadDevices(deps.db, userId);
  // No device given: the user's default one (loadDevices lists it first).
  const device = q.deviceId === undefined ? (all[0] ?? null) : selectDevices(all, q.deviceId)[0]!;
  const recs = await recommendForUser(deps, userId, {
    device: device?.id ?? 'none',
    limit: 50,
    withGpuRequirements: batteryMatters(device, q.battery),
    warmTimeToBeat: true,
  });
  return rankForSession(recs, { minutes: q.minutes, batteryPct: q.battery, device }).slice(
    0,
    limit,
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

type FitFetchers = ReturnType<typeof createFitFetchers>;

/**
 * Will-it-run per device. Steam lookups only happen when a device needs them; a failed lookup
 * leaves the status 'unknown' instead of failing the request.
 */
async function fitsForGame(
  devices: readonly (FilterDevice & { name: string })[],
  { fetchRequirements, fetchDeck }: FitFetchers,
  game: { igdbId: number; platforms?: readonly number[]; steamAppId?: number | null },
  withGpuRequirements = false,
): Promise<GameFit> {
  const appId = game.steamAppId ?? null;
  const live = devices.filter((d) => platformMatches(game, d));
  let deck: DeckCategory | null = null;
  let requirements: FitRequirements | null | undefined;
  if (appId !== null) {
    const needsDeck = devices.some((d) => deviceKind(d) === 'deck');
    const needsRequirements =
      live.some((d) => deviceKind(d) === 'pc') || (withGpuRequirements && live.length > 0);
    [deck, requirements] = await Promise.all([
      needsDeck ? fetchDeck(appId).catch(() => null) : Promise.resolve(null),
      needsRequirements ? fetchRequirements(game).catch(() => null) : Promise.resolve(undefined),
    ]);
  }
  return {
    deck,
    gpuRequirement: requirements?.recGpuScore ?? requirements?.minGpuScore ?? null,
    fits: devices.map((d) => ({
      deviceId: d.id,
      deviceName: d.name,
      ...deviceFitDetail(game, d, { requirements, deck: deck ?? undefined }),
    })),
  };
}

export async function gameFitForUser(
  deps: Pick<UserEngineDeps, 'db' | 'steam'>,
  userId: string,
  game: Pick<Game, 'igdbId' | 'platforms' | 'steamAppId'>,
): Promise<GameFit> {
  return fitsForGame(
    await loadDevices(deps.db, userId),
    createFitFetchers(deps.db, deps.steam),
    game,
  );
}
