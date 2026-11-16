import { queryKeys } from './queryKeys';

/** Query keys to refetch after the library changes: picks and game pages depend on it. */
export const libraryAffected = [
  queryKeys.library,
  queryKeys.recommendationsAll,
  queryKeys.gameDetailAll,
] as const;

/** Query keys to refetch after devices change: picks and fit on game pages depend on them. */
export const devicesAffected = [
  queryKeys.devices,
  queryKeys.recommendationsAll,
  queryKeys.gameDetailAll,
] as const;
