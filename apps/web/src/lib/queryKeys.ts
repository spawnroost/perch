export const queryKeys = {
  library: ['library'] as const,
  devices: ['devices'] as const,
  presets: ['device-presets'] as const,
  gameSearch: (q: string) => ['games', 'search', q] as const,
  hardware: (kind: 'gpus' | 'cpus', q: string) => ['hardware', kind, q] as const,
  recommendationsAll: ['recommendations'] as const,
  recommendations: (device: string, limit: number) => ['recommendations', device, limit] as const,
};
