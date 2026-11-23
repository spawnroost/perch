import { inArray } from 'drizzle-orm';
import { games as gamesTable, type Db, type games } from '@perch/db';
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
import { createBrowseList, type BrowseList } from './browse.js';
import type { TtlMemo } from '../browse/ttl-memo.js';
import { getRecsVersion } from '../recommendation-cache/version.js';
import {
  createCachedFitFetchers,
  createFitFetchers,
  loadDevices,
  loadRecommendInput,
  warmFitCache,
} from './load.js';
import { tasteSummary, type TasteArt } from './taste-card.js';
import type { TasteSummary } from '../schemas/taste-card.js';
import { buildProfile } from './profile.js';
import { computeIdf } from './rank.js';
import { backlogPoolIds, mergeLibrary, recommend, similaritySources } from './recommend.js';
import { similarTo, SIMILAR_LIMIT } from './similar.js';
import { pickFromBacklog, type Mood, type Relaxed } from './roulette.js';
import { batteryMatters, rankForSession, type SessionRanked } from './session.js';
import { DeviceNotFoundError, selectDevices } from '../devices/store.js';
import { getAccountSettings } from '../account/settings.js';
import type { Recommendation, Vocab } from './types.js';

export interface UserEngineDeps {
  db: Db;
  cache: Pick<IgdbCache, 'getGames' | 'queryByTags' | 'warmTimeToBeat'>;
  /** Taste-vocab mapper and labels, injected so core does not depend on taste-vocab. */
  mapVocab: (game: Game & Partial<typeof games.$inferSelect>) => Vocab;
  labels: Readonly<Record<string, string>>;
  /** Remembers browse lists between requests (see `browseForUser`); without it each call builds one. */
  browseLists?: TtlMemo<BrowseList>;
  /** Overrides the Steam client (tests). */
  steam?: SteamClient;
  /** How long a session waits for the time-to-beat warm-up before answering (default 1500). */
  warmWaitMs?: number;
}

/** How long a session waits for time-to-beat to be fetched before answering without it. */
const SESSION_WARM_WAIT_MS = 1500;

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
    /** Fetch missing time-to-beat for the picks in the background (off the request path). */
    warmTimeToBeat?: boolean;
  },
): Promise<UserRecommendation[]> {
  const picks = await recommendPicks(deps, userId, opts);
  return picks.map(withoutGpu);
}

/**
 * Browse by category for a user (see `browse`): games with a chosen genre and theme, never owned
 * or hidden, ranked by taste, filtered by `device` as in `recommendForUser`, each with the same
 * cover/fit/time-to-beat fields. Writes nothing beyond the IGDB cache.
 */
export async function browseForUser(
  deps: UserEngineDeps,
  userId: string,
  opts: {
    genres: readonly number[];
    themes: readonly number[];
    device?: string;
    limit: number;
    offset: number;
    warmTimeToBeat?: boolean;
  },
): Promise<{ picks: UserRecommendation[]; hasMore: boolean }> {
  const { db, cache, mapVocab, labels, steam } = deps;
  const allDevices = await loadDevices(db, userId);
  const devices = selectDevices(allDevices, opts.device); // throws for a device that is not theirs
  const { hideFreeToPlay } = await getAccountSettings(db, userId);
  // Cached fits only: a browse never waits on Steam. A game without cached data has an unknown fit
  // (shown, never hidden); the page's missing data is fetched in the background below.
  const fetchers = createCachedFitFetchers(db);
  const make = async () => {
    const { library, feedback } = await loadRecommendInput(db, userId, mapVocab);
    return createBrowseList(
      {
        getGames: (ids) => cache.getGames(ids),
        queryByTags: (q) => cache.queryByTags(q),
        mapVocab,
        ...fetchers,
        explain: createNoneProvider({ labels }),
      },
      { library, feedback, genres: opts.genres, themes: opts.themes, devices, hideFreeToPlay },
    );
  };
  // The ranked, device-filtered list is remembered per user and tag set, and dropped whenever a
  // write feeds the engine (the user's recs version moves), so pages are stable and cheap. The list
  // only ever grows (a game's fit is decided once, when the walk reaches it), so data warmed later
  // never shifts a page already served; it shows up in lists built after the memo expires.
  const list = deps.browseLists
    ? await deps.browseLists.get(
        browseKey(userId, await getRecsVersion(db, userId), opts.genres, opts.themes, opts.device),
        make,
      )
    : await make();
  const { items, hasMore } = await list.page(opts.offset, opts.limit);
  const picks = await enrichPicks(deps, items, allDevices, fetchers, {
    warmTimeToBeat: opts.warmTimeToBeat,
  });
  warmFitCache(
    db,
    steam,
    picks.map((p) => p.game),
    devices,
    BROWSE_WARM_MAX,
  );
  return { picks: picks.map(withoutGpu), hasMore };
}

/** Most games whose Steam/Deck data one browse page warms in the background. */
const BROWSE_WARM_MAX = 30;

const browseKey = (
  userId: string,
  version: number,
  genres: readonly number[],
  themes: readonly number[],
  device: string | undefined,
) => {
  const ids = (list: readonly number[]) => [...list].sort((a, b) => a - b).join(',');
  return [userId, version, ids(genres), ids(themes), device ?? 'all'].join('|');
};

type SessionPick = UserRecommendation & {
  /** GPU score the game wants (recommended, else minimum); null when unknown or not asked for. */
  gpuRequirement: number | null;
};

function withoutGpu({ gpuRequirement, ...rec }: SessionPick): UserRecommendation {
  void gpuRequirement;
  return rec;
}

async function recommendPicks(
  deps: UserEngineDeps,
  userId: string,
  opts: {
    device?: string;
    limit: number;
    /** Fetch Steam requirements for games live on this device id, to fill `gpuRequirement`. */
    gpuRequirementsFor?: string;
    warmTimeToBeat?: boolean;
    /** With `warmTimeToBeat`: wait up to this long for the fetch, so this response can use it. */
    warmWaitMs?: number;
    /** The user's devices, when the caller has loaded them already. */
    allDevices?: Awaited<ReturnType<typeof loadDevices>>;
    /** Rank only the user's backlog games (see `backlogPoolIds`) instead of the whole feed. */
    backlogOnly?: boolean;
    /** Use only Steam/Deck data already cached (unknown fit stays allowed); never fetch live. */
    cachedFitsOnly?: boolean;
  },
): Promise<SessionPick[]> {
  const { db, cache, mapVocab, labels, steam } = deps;
  const [{ library, feedback }, { hideFreeToPlay }] = await Promise.all([
    loadRecommendInput(db, userId, mapVocab),
    getAccountSettings(db, userId),
  ]);
  const allDevices = opts.allDevices ?? (await loadDevices(db, userId));
  const fetchers = opts.cachedFitsOnly ? createCachedFitFetchers(db) : createFitFetchers(db, steam);
  const recs = await recommend(
    {
      getGames: (ids) => cache.getGames(ids),
      queryByTags: (q) => cache.queryByTags(q),
      mapVocab,
      ...fetchers,
      explain: createNoneProvider({ labels }),
      labels,
    },
    {
      library,
      feedback,
      limit: opts.limit,
      devices: selectDevices(allDevices, opts.device),
      hideFreeToPlay,
      ...(opts.backlogOnly ? { pool: backlogPoolIds(library) } : {}),
    },
  );
  return enrichPicks(deps, recs, allDevices, fetchers, opts);
}

/** Adds cover, time-to-beat and per-device fit to picks. The picks are cached by now: one DB read. */
async function enrichPicks(
  deps: UserEngineDeps,
  recs: readonly Recommendation[],
  allDevices: readonly (FilterDevice & { name: string })[],
  fetchers: FitFetchers,
  opts: { gpuRequirementsFor?: string; warmTimeToBeat?: boolean; warmWaitMs?: number },
): Promise<SessionPick[]> {
  const { db, cache } = deps;
  const ids = recs.map((r) => r.game.igdbId);
  if (opts.warmTimeToBeat) {
    const warm = Promise.resolve(cache.warmTimeToBeat(ids));
    if (opts.warmWaitMs !== undefined) await waitAtMost(warm, opts.warmWaitMs);
  }
  const [full, ttb] = await Promise.all([cache.getGames(ids), loadTimeToBeat(db, ids)]);
  const byId = new Map(full.map((g) => [g.igdbId, g]));
  return Promise.all(
    recs.map(async (rec) => {
      const game = byId.get(rec.game.igdbId);
      const { gpuRequirement, ...fit } = await fitsForGame(
        allDevices,
        fetchers,
        game ?? rec.game,
        opts.gpuRequirementsFor,
      );
      return {
        ...rec,
        coverUrl: game?.coverUrl ?? null,
        coverUrlSmall: game?.coverUrlSmall ?? null,
        heroUrl: game?.heroUrl ?? null,
        accent: game?.accent ?? null,
        timeToBeat: ttb.get(rec.game.igdbId) ?? null,
        ...fit,
        gpuRequirement,
      };
    }),
  );
}

/** Resolves when `p` settles or after `ms`, whichever is first (never rejects). */
async function waitAtMost(p: Promise<unknown>, ms: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    p.catch(() => {}),
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, ms);
    }),
  ]);
  clearTimeout(timer);
}

/**
 * "More like this" for a user: games close to `game` (see `similarTo`), filtered by `device` as in
 * `recommendForUser`, each with the same cover/fit/time-to-beat fields. Null when the game is
 * unknown. Reads the game through `cache.getGame` and may warm time-to-beat caches; it writes
 * nothing else.
 */
export async function similarForUser(
  deps: UserEngineDeps & { cache: Pick<IgdbCache, 'getGame'> },
  userId: string,
  igdbId: number,
  opts: { device?: string; limit?: number; warmTimeToBeat?: boolean } = {},
): Promise<{ game: { igdbId: number; name: string }; picks: UserRecommendation[] } | null> {
  const { db, cache, mapVocab, labels, steam } = deps;
  const [seed, { library, feedback }, allDevices, { hideFreeToPlay }] = await Promise.all([
    cache.getGame(igdbId),
    loadRecommendInput(db, userId, mapVocab),
    loadDevices(db, userId),
    getAccountSettings(db, userId),
  ]);
  if (!seed) return null;
  const fetchers = createFitFetchers(db, steam);
  const recs = await similarTo(
    {
      getGames: (ids) => cache.getGames(ids),
      queryByTags: (q) => cache.queryByTags(q),
      mapVocab,
      ...fetchers,
      explain: createNoneProvider({ labels }),
    },
    {
      game: { ...seed, vocab: mapVocab(seed) },
      library: mergeLibrary(library),
      feedback,
      labels,
      limit: opts.limit ?? SIMILAR_LIMIT,
      devices: selectDevices(allDevices, opts.device),
      hideFreeToPlay,
    },
  );
  const picks = await enrichPicks(deps, recs, allDevices, fetchers, {
    warmTimeToBeat: opts.warmTimeToBeat,
  });
  return {
    game: { igdbId: seed.igdbId, name: seed.name },
    picks: picks.map(withoutGpu),
  };
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
  const device = q.deviceId === undefined ? (all[0] ?? null) : selectDevices(all, q.deviceId)[0];
  if (device === undefined) throw new DeviceNotFoundError(`no device matches "${q.deviceId}"`);
  const recs = await recommendPicks(deps, userId, {
    allDevices: all,
    device: device?.id ?? 'none',
    limit: 50,
    gpuRequirementsFor: batteryMatters(device, q.battery) ? device?.id : undefined,
    warmTimeToBeat: true,
    // Wait briefly so the first answer can use time-to-beat, but never hold the response long.
    warmWaitMs: deps.warmWaitMs ?? SESSION_WARM_WAIT_MS,
  });
  return rankForSession(recs, { minutes: q.minutes, batteryPct: q.battery, device }).slice(
    0,
    limit,
  );
}

/** How many of the user's backlog games the roulette ranks (the draw is over the best 10). */
const ROULETTE_SCAN = 60;
/** Most games whose Steam/Deck data a roulette spin warms in the background. */
const ROULETTE_WARM_MAX = 30;

/**
 * One game to play from the user's backlog (owned, status 'backlog'), drawn as in `pickFromBacklog`
 * and filtered by `device` as in `recommendForUser`. Null when no backlog game is left.
 */
export async function rouletteForUser(
  deps: UserEngineDeps,
  userId: string,
  q: { device?: string; minutes?: number; mood?: Mood; exclude?: readonly number[] },
  rng?: () => number,
): Promise<{ pick: SessionRanked<UserRecommendation>; relaxed: Relaxed | null } | null> {
  const all = await loadDevices(deps.db, userId);
  const selected = selectDevices(all, q.device); // throws for a device that is not theirs
  const picks = await recommendPicks(deps, userId, {
    allDevices: all,
    backlogOnly: true,
    device: q.device,
    limit: ROULETTE_SCAN,
    cachedFitsOnly: true,
    warmTimeToBeat: true,
    warmWaitMs: deps.warmWaitMs ?? SESSION_WARM_WAIT_MS,
  });
  // Missing Steam/Deck data is fetched off the request path, for the next spin.
  warmFitCache(
    deps.db,
    deps.steam,
    picks.map((p) => p.game),
    selected,
    ROULETTE_WARM_MAX,
  );
  const out = pickFromBacklog({
    games: picks,
    device: selected.length === 1 ? (selected[0] ?? null) : null,
    minutes: q.minutes,
    mood: q.mood,
    exclude: q.exclude,
    rng,
  });
  if (!out) return null;
  const { gpuRequirement, ...pick } = out.pick;
  void gpuRequirement;
  return { ...out, pick };
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
  /** Also fetch Steam requirements when the game is live on this device (for `gpuRequirement`). */
  gpuRequirementsFor?: string,
): Promise<GameFit & { gpuRequirement: number | null }> {
  const appId = game.steamAppId ?? null;
  const live = devices.filter((d) => platformMatches(game, d));
  let deck: DeckCategory | null = null;
  let requirements: FitRequirements | null | undefined;
  if (appId !== null) {
    const needsDeck = devices.some((d) => deviceKind(d) === 'deck');
    const needsRequirements =
      live.some((d) => deviceKind(d) === 'pc') ||
      (gpuRequirementsFor !== undefined && live.some((d) => d.id === gpuRequirementsFor));
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
  const { gpuRequirement, ...fit } = await fitsForGame(
    await loadDevices(deps.db, userId),
    createFitFetchers(deps.db, deps.steam),
    game,
  );
  void gpuRequirement;
  return fit;
}

/**
 * Will-it-run for several games at once: devices are read once. Returns each game's fit keyed by
 * its IGDB id.
 */
export interface GameFitsResult {
  fits: Record<number, GameFit>;
  /** Ids still waiting on Steam when the budget ran out; their fetches keep warming the cache. */
  pending: number[];
}

/**
 * Batched fit for a result list. With `budgetMs`, games whose Steam lookups are still queued when
 * it runs out are left out of `fits` and listed in `pending`, so a cold cache never holds up the
 * whole batch behind the Steam rate limit.
 */
export async function gameFitsForUser(
  deps: Pick<UserEngineDeps, 'db' | 'steam'>,
  userId: string,
  games: readonly Pick<Game, 'igdbId' | 'platforms' | 'steamAppId'>[],
  opts: { budgetMs?: number } = {},
): Promise<GameFitsResult> {
  if (games.length === 0) return { fits: {}, pending: [] };
  const devices = await loadDevices(deps.db, userId);
  const fetchers = createFitFetchers(deps.db, deps.steam);
  const PENDING = Symbol('pending');
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline =
    opts.budgetMs === undefined
      ? null
      : new Promise<typeof PENDING>((resolve) => {
          timer = setTimeout(() => resolve(PENDING), opts.budgetMs);
        });
  try {
    const entries = await Promise.all(
      games.map(async (game) => {
        const work = fitsForGame(devices, fetchers, game).then(
          ({ gpuRequirement, ...fit }) => (void gpuRequirement, fit),
        );
        const fit = deadline ? await Promise.race([work, deadline]) : await work;
        return [game.igdbId, fit] as const;
      }),
    );
    const result: GameFitsResult = { fits: {}, pending: [] };
    for (const [id, fit] of entries) {
      if (fit === PENDING) result.pending.push(id);
      else result.fits[id] = fit;
    }
    return result;
  } finally {
    clearTimeout(timer);
  }
}

/** The user's taste card summary (see `tasteSummary`). Reads the library and the cover art; writes nothing. */
export async function tasteSummaryForUser(
  deps: Pick<UserEngineDeps, 'db' | 'mapVocab' | 'labels'>,
  userId: string,
  now: Date = new Date(),
): Promise<TasteSummary> {
  const { library, feedback } = await loadRecommendInput(deps.db, userId, deps.mapVocab);
  const ids = [...new Set(library.map((l) => l.game.igdbId))];
  const rows = ids.length
    ? await deps.db
        .select({
          igdbId: gamesTable.igdbId,
          coverUrl: gamesTable.coverUrl,
          coverUrlSmall: gamesTable.coverUrlSmall,
          accent: gamesTable.accent,
        })
        .from(gamesTable)
        .where(inArray(gamesTable.igdbId, ids))
    : [];
  const art = new Map<number, TasteArt>(rows.map(({ igdbId, ...a }) => [igdbId, a]));
  return tasteSummary({ library, feedback, labels: deps.labels, art, now });
}
