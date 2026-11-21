export { listWatches, removeWatch, setWatch, WatchLimitError } from './db.js';
export type { WatchRow } from './db.js';
export { DIGEST_MIN_GAP_MS, runPriceDigest } from './digest.js';
export type { DigestDeps, DigestResult } from './digest.js';
export { buildDigest, evaluateWatch, formatUsd, isDeal } from './evaluate.js';
export type { DigestItem, WatchDecision, WatchState } from './evaluate.js';
export {
  WATCH_LIMIT,
  watchBodySchema,
  watchListResponseSchema,
  watchResponseSchema,
  watchSchema,
} from './schemas.js';
export type { Watch, WatchBody, WatchListResponse, WatchResponse } from './schemas.js';
