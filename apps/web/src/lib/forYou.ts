import type { RecommendationsResponse } from '@perch/core';

export const ALL_TAB = 'all';
/** Picks per tab on For you. */
export const FOR_YOU_LIMIT = 20;

export interface Tab {
  value: string;
  label: string;
}

export type Recommendation = RecommendationsResponse['recommendations'][number];
/** One device's will-it-run result for a pick. */
export type DeviceFit = Recommendation['fits'][number];

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

/** IGDB id from the `/games/:id` route param; null unless a positive integer. */
export function parseGameId(param: string | undefined): number | null {
  if (!param || !/^\d+$/.test(param)) return null;
  const id = Number(param);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
