import { getPreset, IGDB_PLATFORM } from '../devices/presets.js';
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

export type DeviceKind = 'console' | 'deck' | 'pc' | 'phone' | 'tablet';

export function deviceKind(device: Pick<FilterDevice, 'kind'>): DeviceKind {
  const preset = getPreset(device.kind);
  if (!preset) return 'pc';
  if (preset.form) return preset.form;
  return preset.deckCompat ? 'deck' : 'console';
}

export function platformMatches(game: FitGame, device: Pick<FilterDevice, 'platformIds'>): boolean {
  const own = new Set(device.platformIds);
  return (game.platforms ?? []).some((p) => own.has(p));
}

export interface FitDetail {
  status: FitStatus;
  /** One short sentence saying why the device got this status. */
  reason: string;
}

const list = (words: string[]) =>
  words.length > 1 ? `${words.slice(0, -1).join(', ')} and ${words.at(-1)}` : words[0]!;

/** Worst-of-three comparison; null on either side skips that dimension. */
function pcFit(device: FilterDevice, r: FitRequirements | null | undefined): FitDetail {
  if (!r) return { status: 'unknown', reason: 'No system requirements found' };
  const dims: [string, number | null, number | null, number | null][] = [
    ['GPU', device.gpuScore, r.minGpuScore, r.recGpuScore],
    ['CPU', device.cpuScore, r.minCpuScore, r.recCpuScore],
    ['RAM', device.ramGb, r.minRamGb, r.recRamGb],
  ];
  const labels: Record<'hidden' | 'yellow' | 'green', string[]> = {
    hidden: [],
    yellow: [],
    green: [],
  };
  let hasRec = false;
  for (const [label, have, min, rec] of dims) {
    if (have === null || (min === null && rec === null)) continue;
    // With only one side known, that side is the bar.
    const floor = min ?? rec!;
    if (rec !== null) hasRec = true;
    if (have < floor) labels.hidden.push(label);
    else if (rec !== null && have < rec) labels.yellow.push(label);
    else labels.green.push(label);
  }
  const verb = (l: string[]) => (l.length > 1 ? 'are' : 'is');
  if (labels.hidden.length > 0) {
    return {
      status: 'hidden',
      reason: `${list(labels.hidden)} ${verb(labels.hidden)} below the minimum`,
    };
  }
  if (labels.yellow.length > 0) {
    return {
      status: 'yellow',
      reason: `${list(labels.yellow)} ${verb(labels.yellow)} below the recommended specs`,
    };
  }
  if (labels.green.length > 0) {
    return {
      status: 'green',
      reason: hasRec ? 'Meets the recommended specs' : 'Meets the minimum specs',
    };
  }
  return { status: 'unknown', reason: 'Not enough data to compare' };
}

/** "Available on iOS" / "Available on Android", named from the device's own platform. */
function mobileReason(device: Pick<FilterDevice, 'platformIds'>): string {
  if (device.platformIds.includes(IGDB_PLATFORM.ios)) return 'Available on iOS';
  if (device.platformIds.includes(IGDB_PLATFORM.android)) return 'Available on Android';
  return 'Available on this device';
}

const DECK_FIT: Record<DeckCategory, FitDetail> = {
  verified: { status: 'green', reason: 'Steam Deck Verified' },
  playable: { status: 'yellow', reason: 'Playable on Steam Deck with some tweaks' },
  unsupported: { status: 'hidden', reason: 'Steam Deck Unsupported' },
  unknown: { status: 'unknown', reason: 'No Steam Deck rating yet' },
};

/** Will-it-run of one game on one device: the status and the reason behind it. */
export function deviceFitDetail(
  game: FitGame,
  device: FilterDevice,
  info: FitInfo,
  opts: FitOptions = {},
): FitDetail {
  if (!platformMatches(game, device)) {
    return { status: 'hidden', reason: 'Not released on this device' };
  }
  switch (deviceKind(device)) {
    case 'console':
      return { status: 'green', reason: 'Available on this console' };
    case 'phone':
    case 'tablet':
      return { status: 'green', reason: mobileReason(device) };
    case 'deck': {
      const detail = DECK_FIT[info.deck ?? 'unknown'];
      return opts.allowUnsupported && detail.status === 'hidden'
        ? { status: 'yellow', reason: detail.reason }
        : detail;
    }
    case 'pc':
      return pcFit(device, info.requirements);
  }
}

export function deviceFit(
  game: FitGame,
  device: FilterDevice,
  info: FitInfo,
  opts: FitOptions = {},
): FitStatus {
  return deviceFitDetail(game, device, info, opts).status;
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
    if (best.deviceId === null || RANK[status] > RANK[best.status])
      best = { status, deviceId: d.id };
  }
  return best;
}
