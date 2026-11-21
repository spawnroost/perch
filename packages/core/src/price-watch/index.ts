export {
  listWatches,
  priceEmailsEnabled,
  removeWatch,
  setPriceEmails,
  setWatch,
  WatchLimitError,
} from './db.js';
export type { WatchRow } from './db.js';
export { DIGEST_MIN_GAP_MS, runPriceDigest } from './digest.js';
export type { DigestDeps, DigestResult } from './digest.js';
export { buildDigest, evaluateWatch, formatUsd, isDeal } from './evaluate.js';
export type { DigestItem, WatchDecision, WatchState } from './evaluate.js';
export {
  WATCH_LIMIT,
  watchBodySchema,
  watchEmailsBodySchema,
  watchListResponseSchema,
  watchResponseSchema,
  watchSchema,
} from './schemas.js';
export type {
  Watch,
  WatchBody,
  WatchEmailsBody,
  WatchListResponse,
  WatchResponse,
} from './schemas.js';
