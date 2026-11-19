import type { PlayedBefore } from '@perch/core/browser';

/** Stable empty list for "no result yet" (a fresh [] each render would look like a new result). */
export const NO_PLAYED_BEFORE: readonly PlayedBefore[] = [];

export const playedBeforeHeading = (count: number) => `You've played ${count} of these before`;

const DATE = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

/** "100 h · 5 Jan 2020": the hours and last played date that are known (Xbox has no hours). */
export function playedBeforeDetail({ minutes, lastPlayed }: PlayedBefore): string {
  const parts: string[] = [];
  if (minutes !== null) parts.push(`${Math.round((minutes / 60) * 10) / 10} h`);
  if (lastPlayed) parts.push(DATE.format(new Date(lastPlayed)));
  return parts.join(' · ');
}

/** Everything starts checked, so the state is the set of ids the user cleared. */
export function toggleSelected(cleared: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(cleared);
  if (!next.delete(id)) next.add(id);
  return next;
}

export function selectedIds(entries: readonly PlayedBefore[], cleared: ReadonlySet<string>) {
  return entries.filter((e) => !cleared.has(e.entryId)).map((e) => e.entryId);
}
