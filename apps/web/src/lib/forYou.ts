import type { FitStatus, RecommendationsResponse } from '@perch/core';

export const ALL_TAB = 'all';
/** Picks per tab on For you. */
export const FOR_YOU_LIMIT = 20;

export interface Tab {
  value: string;
  label: string;
}

export interface FitChip {
  deviceId: string;
  deviceName: string;
  status: FitStatus;
}

interface NamedDevice {
  id: string;
  name: string;
}

/** "All" first, then one tab per device. */
export function buildTabs(devices: readonly NamedDevice[]): Tab[] {
  return [
    { value: ALL_TAB, label: 'All' },
    ...devices.map((d) => ({ value: d.id, label: d.name })),
  ];
}

/** The `device` query param of `/api/recommendations` for a tab ('all' or a device id). */
export function tabDeviceParam(tab: string): string {
  return tab;
}

type FitsByDevice = ReadonlyMap<string, ReadonlyMap<number, FitStatus>>;

/** Index every returned fit by device then game, across several recommendation responses. */
export function collectFits(
  responses: readonly (RecommendationsResponse | undefined)[],
): FitsByDevice {
  const byDevice = new Map<string, Map<number, FitStatus>>();
  for (const response of responses) {
    for (const { game, fit } of response?.recommendations ?? []) {
      if (!fit) continue;
      const games = byDevice.get(fit.deviceId) ?? new Map<number, FitStatus>();
      games.set(game.igdbId, fit.status);
      byDevice.set(fit.deviceId, games);
    }
  }
  return byDevice;
}

/** The per-device fit row of one pick: devices in order, omitting those with no status for it. */
export function buildFitRows(
  devices: readonly NamedDevice[],
  fits: FitsByDevice,
  igdbId: number,
): FitChip[] {
  const rows: FitChip[] = [];
  for (const d of devices) {
    const status = fits.get(d.id)?.get(igdbId);
    if (status) rows.push({ deviceId: d.id, deviceName: d.name, status });
  }
  return rows;
}

/** IGDB id from the `/games/:id` route param; null unless a positive integer. */
export function parseGameId(param: string | undefined): number | null {
  if (!param || !/^\d+$/.test(param)) return null;
  const id = Number(param);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
