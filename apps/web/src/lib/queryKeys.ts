import type { SessionQuery } from '@perch/core';

export const queryKeys = {
  account: ['account'] as const,
  authProviders: ['auth-providers'] as const,
  library: ['library'] as const,
  /** Imported games waiting for the "played before" answer. */
  playedBefore: ['library', 'played-before'] as const,
  tasteCard: ['taste-card'] as const,
  devices: ['devices'] as const,
  presets: ['device-presets'] as const,
  soundtrack: (igdbId: number) => ['games', 'soundtrack', igdbId] as const,
  playerVoice: (igdbId: number) => ['games', 'player-voice', igdbId] as const,
  gameDetailAll: ['games', 'detail'] as const,
  game: (igdbId: number) => ['games', 'detail', igdbId] as const,
  /** Prefix of every batched search-fit query; refreshed with library and device changes. */
  gameFitsAll: ['games', 'fit'] as const,
  /** One batched fit request; the ids are sorted so any order shares a cache entry. */
  gameFits: (igdbIds: readonly number[]) =>
    ['games', 'fit', [...igdbIds].sort((a, b) => a - b)] as const,
  /** The user's feedback, by game. */
  feedback: ['feedback'] as const,
  gameSearch: (q: string) => ['games', 'search', q] as const,
  hardware: (kind: 'gpus' | 'cpus', q: string) => ['hardware', kind, q] as const,
  recommendationsAll: ['recommendations'] as const,
  /** Under `recommendationsAll`, so library and feedback changes refresh sessions too. */
  session: (q: SessionQuery | null) => ['recommendations', 'session', q] as const,
  /** Under `recommendationsAll`, so optimistic feedback drops also prune "More like this". */
  similar: (igdbId: number, device: string) =>
    ['recommendations', 'similar', igdbId, device] as const,
  /** Browse pages (infinite queries). Its own root: feedback prunes them in place, never refetches. */
  browseAll: ['browse', 'feed'] as const,
  browse: (genres: readonly number[], themes: readonly number[], device: string) =>
    ['browse', 'feed', genres, themes, device] as const,
  browseFacets: ['browse', 'facets'] as const,
  /** One roulette spin: `spin` makes every spin its own request, never a cached one. */
  roulette: (spin: number, params: object) => ['roulette', spin, params] as const,
  recommendations: (device: string, limit: number) =>
    ['recommendations', 'feed', device, limit] as const,
};
