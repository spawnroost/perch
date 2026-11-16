import type { GameDetailResponse } from '@perch/core';

/** "About 15 h to beat" from the main-story time (else the closest figure); null with no data. */
export function timeToBeatLabel(t: GameDetailResponse['timeToBeat']): string | null {
  if (!t) return null;
  const hours = t.normallyHours ?? t.hastilyHours ?? t.completelyHours;
  if (hours === null) return null;
  return `About ${Number.isInteger(hours) ? hours : hours.toFixed(1)} h to beat`;
}
