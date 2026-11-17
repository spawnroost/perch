import type { GameDetailResponse } from '@perch/core';

type TimeToBeat = GameDetailResponse['timeToBeat'];

/** Main-story hours (else the closest figure); null with no data. */
export function timeToBeatHours(t: TimeToBeat): number | null {
  if (!t) return null;
  return t.normallyHours ?? t.hastilyHours ?? t.completelyHours;
}

/** "About 15 h to beat" from the main-story time (else the closest figure); null with no data. */
export function timeToBeatLabel(t: TimeToBeat): string | null {
  const hours = timeToBeatHours(t);
  if (hours === null) return null;
  return `About ${Number.isInteger(hours) ? hours : hours.toFixed(1)} h to beat`;
}
