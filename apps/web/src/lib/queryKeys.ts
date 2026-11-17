import type { SessionQuery } from '@perch/core';

export const queryKeys = {
  library: ['library'] as const,
  devices: ['devices'] as const,
  presets: ['device-presets'] as const,
  gameDetailAll: ['games', 'detail'] as const,
  game: (igdbId: number) => ['games', 'detail', igdbId] as const,
  /** The user's feedback, by game. */
  feedback: ['feedback'] as const,
  gameSearch: (q: string) => ['games', 'search', q] as const,
  hardware: (kind: 'gpus' | 'cpus', q: string) => ['hardware', kind, q] as const,
  recommendationsAll: ['recommendations'] as const,
  /** Under `recommendationsAll`, so library and feedback changes refresh sessions too. */
  session: (q: SessionQuery | null) => ['recommendations', 'session', q] as const,
  recommendations: (device: string, limit: number) =>
    ['recommendations', 'feed', device, limit] as const,
};
