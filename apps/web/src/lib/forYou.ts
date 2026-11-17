import type { RecommendationsResponse } from '@perch/core';
import { fitDisplay, type Tone } from './fit';
import { timeToBeatHours } from './timeToBeat';

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

export interface PickShelf {
  id: string;
  title: string;
  picks: Recommendation[];
}

/** Fewest timed games for the Short sessions shelf to be worth showing. */
export const SHORT_SESSION_MIN = 3;
export const SHORT_SESSIONS_ID = 'short-sessions';

/** Shelves for the launcher: All picks, one per device the picks run well on, then Short sessions. */
export function buildShelves(
  picks: readonly Recommendation[],
  devices: readonly NamedDevice[],
): PickShelf[] {
  const shelves: PickShelf[] = [{ id: ALL_TAB, title: 'All picks', picks: [...picks] }];
  for (const d of devices) {
    const fitting = picks.filter((p) =>
      p.fits.some((f) => f.deviceId === d.id && f.status === 'green'),
    );
    if (fitting.length > 0) {
      shelves.push({ id: d.id, title: `Fits your ${d.name}`, picks: fitting });
    }
  }
  const timed = picks.flatMap((p) => {
    const hours = timeToBeatHours(p.timeToBeat);
    return hours === null ? [] : [{ p, hours }];
  });
  if (timed.length >= SHORT_SESSION_MIN) {
    timed.sort((a, b) => a.hours - b.hours);
    shelves.push({
      id: SHORT_SESSIONS_ID,
      title: 'Short sessions',
      picks: timed.map((t) => t.p),
    });
  }
  return shelves;
}

export interface FitChip {
  label: string;
  tone: Tone;
}

/** One HUD chip per device: its name and a tone from the will-it-run status. */
export function fitChips(fits: readonly DeviceFit[]): FitChip[] {
  return fits.map((f) => ({ label: f.deviceName, tone: fitDisplay(f.status).tone }));
}
