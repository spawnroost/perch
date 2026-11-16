import { getPreset } from '../devices/presets.js';
import type { DeckCategory } from '../requirements/steam.js';

export type { DeckCategory };

export type FitStatus = 'green' | 'yellow' | 'unknown' | 'hidden';

/** The slice of a device the filters read (a `devices` row). */
export interface FilterDevice {
  id: string;
  /** 'pc' or a preset id. */
  kind: string;
  platformIds: readonly number[];
  gpuScore: number | null;
  cpuScore: number | null;
  ramGb: number | null;
}

/** Requirement scores of a game; null = unknown. */
export interface FitRequirements {
  minGpuScore: number | null;
  minCpuScore: number | null;
  minRamGb: number | null;
  recGpuScore: number | null;
  recCpuScore: number | null;
  recRamGb: number | null;
}

export interface FitInfo {
  requirements?: FitRequirements | null;
  deck?: DeckCategory;
}

export interface FitOptions {
  /** Treat Steam Deck "unsupported" as yellow instead of hidden. */
  allowUnsupported?: boolean;
}

export interface BestFit {
  status: FitStatus;
  deviceId: string | null;
}

type FitGame = { platforms?: readonly number[] };

const RANK: Record<FitStatus, number> = { hidden: 0, unknown: 1, yellow: 2, green: 3 };

export type DeviceKind = 'console' | 'deck' | 'pc';

export function deviceKind(device: Pick<FilterDevice, 'kind'>): DeviceKind {
  const preset = getPreset(device.kind);
  if (!preset) return 'pc';
  return preset.deckCompat ? 'deck' : 'console';
}

export function platformMatches(game: FitGame, device: Pick<FilterDevice, 'platformIds'>): boolean {
  const own = new Set(device.platformIds);
  return (game.platforms ?? []).some((p) => own.has(p));
}

/** Worst-of-three comparison; null on either side skips that dimension. */
function pcFit(device: FilterDevice, r: FitRequirements | null | undefined): FitStatus {
  if (!r) return 'unknown';
  const dims: [number | null, number | null, number | null][] = [
    [device.gpuScore, r.minGpuScore, r.recGpuScore],
    [device.cpuScore, r.minCpuScore, r.recCpuScore],
    [device.ramGb, r.minRamGb, r.recRamGb],
  ];
  let worst: FitStatus | null = null;
  const note = (s: FitStatus) => {
    if (worst === null || RANK[s] < RANK[worst]) worst = s;
  };
  for (const [have, min, rec] of dims) {
    if (have === null || (min === null && rec === null)) continue;
    // With only one side known, that side is the bar.
    const floor = min ?? rec!;
    if (have < floor) note('hidden');
    else if (rec !== null && have < rec) note('yellow');
    else note('green');
  }
  return worst ?? 'unknown';
}

export function deviceFit(
  game: FitGame,
  device: FilterDevice,
  info: FitInfo,
  opts: FitOptions = {},
): FitStatus {
  if (!platformMatches(game, device)) return 'hidden';
  switch (deviceKind(device)) {
    case 'console':
      return 'green';
    case 'deck':
      switch (info.deck) {
        case 'verified':
          return 'green';
        case 'playable':
          return 'yellow';
        case 'unsupported':
          return opts.allowUnsupported ? 'yellow' : 'hidden';
        default:
          return 'unknown';
      }
    case 'pc':
      return pcFit(device, info.requirements);
  }
}

/** Best status over all devices (first device wins ties) and the device that gave it. */
export function bestFit(
  game: FitGame,
  devices: readonly FilterDevice[],
  infoFor: (device: FilterDevice) => FitInfo,
  opts: FitOptions = {},
): BestFit {
  let best: BestFit = { status: 'hidden', deviceId: null };
  for (const d of devices) {
    const status = deviceFit(game, d, infoFor(d), opts);
    if (best.deviceId === null || RANK[status] > RANK[best.status]) best = { status, deviceId: d.id };
  }
  return best;
}
