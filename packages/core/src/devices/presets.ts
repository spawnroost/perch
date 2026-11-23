/** IGDB platform ids (verified against the IGDB /platforms endpoint 2026-11-16). */
export const IGDB_PLATFORM = {
  linux: 3,
  windows: 6,
  mac: 14,
  ps4: 48,
  xboxOne: 49,
  switch: 130,
  ps5: 167,
  xboxSeries: 169,
  switch2: 508,
  ios: 39,
  android: 34,
} as const;

export interface PresetHardware {
  /** Names the GPU/CPU tier matcher resolves to scores. */
  gpuName: string;
  cpuName: string;
  ramGb: number;
}

export interface DevicePreset {
  id: string;
  name: string;
  /** IGDB platforms this device plays, including backward-compatible ones. */
  platformIds: number[];
  /** Fixed hardware for PC-like handhelds; consoles need none. */
  hardware?: PresetHardware;
  /** Phones and tablets: platform-only fit, no GPU tier. */
  form?: 'phone' | 'tablet';
  /** Filter PC games by Steam Deck compatibility. */
  deckCompat?: boolean;
}

const P = IGDB_PLATFORM;

export const DEVICE_PRESETS: readonly DevicePreset[] = [
  { id: 'ps5', name: 'PlayStation 5', platformIds: [P.ps5, P.ps4] },
  { id: 'ps4', name: 'PlayStation 4', platformIds: [P.ps4] },
  { id: 'xbox-series', name: 'Xbox Series X|S', platformIds: [P.xboxSeries, P.xboxOne] },
  { id: 'switch', name: 'Nintendo Switch', platformIds: [P.switch] },
  { id: 'switch-2', name: 'Nintendo Switch 2', platformIds: [P.switch2, P.switch] },
  {
    id: 'steam-deck',
    name: 'Steam Deck',
    platformIds: [P.windows],
    hardware: { gpuName: 'Steam Deck GPU', cpuName: 'Steam Deck CPU', ramGb: 16 },
    deckCompat: true,
  },
  {
    id: 'rog-ally',
    name: 'ROG Ally',
    platformIds: [P.windows],
    hardware: { gpuName: 'AMD Radeon 780M', cpuName: 'AMD Ryzen Z1 Extreme', ramGb: 16 },
  },
  { id: 'mac', name: 'Mac', platformIds: [P.mac] },
  { id: 'iphone', name: 'iPhone', platformIds: [P.ios], form: 'phone' },
  { id: 'ipad', name: 'iPad', platformIds: [P.ios], form: 'tablet' },
  { id: 'android-phone', name: 'Android phone', platformIds: [P.android], form: 'phone' },
  { id: 'android-tablet', name: 'Android tablet', platformIds: [P.android], form: 'tablet' },
];

export function getPreset(id: string): DevicePreset | undefined {
  return DEVICE_PRESETS.find((p) => p.id === id);
}
