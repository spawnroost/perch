export {
  createIgdbClient,
  createIgdbClientFromEnv,
  IGDB_MAX_LIMIT,
  IgdbError,
  STEAM_SOURCE_ID,
} from './client.js';
export type { IgdbClient, IgdbClientOptions, TagQuery } from './client.js';
export { createIgdbCache, CACHE_TTL_MS } from './cache.js';
export type { IgdbCache, IgdbCacheOptions } from './cache.js';
export { RateQueue } from './queue.js';
export { TokenProvider } from './token.js';
export type { Game, GameCandidate, SearchResult, TimeToBeat } from './schemas.js';
export { loadTimeToBeat, MIN_TIME_TO_BEAT_COUNT, toTimeToBeatHours } from './time-to-beat.js';
export type { TimeToBeatHours } from './time-to-beat.js';
export { createAccentFetcher, pickAccent } from './accent.js';
export type { AccentFetcherOptions } from './accent.js';
