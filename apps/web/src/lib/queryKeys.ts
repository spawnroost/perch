export const queryKeys = {
  library: ['library'] as const,
  devices: ['devices'] as const,
  presets: ['device-presets'] as const,
  game: (igdbId: number) => ['games', 'detail', igdbId] as const,
  /** The user's feedback, by game. */
  feedback: ['feedback'] as const,
  gameSearch: (q: string) => ['games', 'search', q] as const,
  hardware: (kind: 'gpus' | 'cpus', q: string) => ['hardware', kind, q] as const,
  recommendationsAll: ['recommendations'] as const,
  recommendations: (device: string, limit: number) => ['recommendations', device, limit] as const,
};
