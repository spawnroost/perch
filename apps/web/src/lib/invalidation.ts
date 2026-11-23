import { queryKeys } from './queryKeys';

/** Query keys to refetch after the library changes: picks, game pages and search fits depend on it. */
export const libraryAffected = [
  queryKeys.library,
  queryKeys.recommendationsAll,
  queryKeys.browseAll,
  queryKeys.gameDetailAll,
  queryKeys.gameFitsAll,
  queryKeys.tasteCard,
] as const;

/** Query keys to refetch after the hide free-to-play setting changes (its picks and browse lists). */
export const hideFreeToPlayAffected = [
  queryKeys.account,
  queryKeys.recommendationsAll,
  ['browse'],
] as const;

/** Query keys to refetch after devices change: picks and fit on game pages depend on them. */
export const devicesAffected = [
  queryKeys.devices,
  queryKeys.recommendationsAll,
  queryKeys.browseAll,
  queryKeys.gameDetailAll,
  queryKeys.gameFitsAll,
] as const;
