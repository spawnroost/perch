export const queryKeys = {
  library: ['library'] as const,
  devices: ['devices'] as const,
  presets: ['devices', 'presets'] as const,
  gameSearch: (q: string) => ['games', 'search', q] as const,
  hardware: (kind: 'gpus' | 'cpus', q: string) => ['hardware', kind, q] as const,
  recommendations: (device: string, limit: number) => ['recommendations', device, limit] as const,
};
