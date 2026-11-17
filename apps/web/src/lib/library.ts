/** Library page logic: sort, filter, display text and the edit form -> patch. */
import type { LibraryEntry, LibraryPatchInput } from '@perch/core';
import type { HudChipProps } from '@/components/atoms/HudChip';
import type { Tone } from './fit';
import { parseHours } from './onboarding';

export type Status = LibraryEntry['status'];
export const STATUSES = ['playing', 'finished', 'dropped', 'backlog'] as const satisfies Status[];
export const STATUS_LABEL: Record<Status, string> = {
  playing: 'Playing',
  finished: 'Finished',
  dropped: 'Dropped',
  backlog: 'Backlog',
};

/** Filter chip order: everything, then statuses in the order a player thinks of them. */
export const STATUS_FILTERS = [
  'all',
  'playing',
  'backlog',
  'finished',
  'dropped',
] as const satisfies (Status | 'all')[];

export const SORTS = ['recent', 'hours', 'title', 'added'] as const;
export type LibrarySort = (typeof SORTS)[number];
export const SORT_LABEL: Record<LibrarySort, string> = {
  recent: 'Recently played',
  hours: 'Most played',
  title: 'Title',
  added: 'Recently added',
};

export interface LibraryFilter {
  query: string;
  status: Status | 'all';
}

export function filterLibrary(entries: LibraryEntry[], { query, status }: LibraryFilter) {
  const q = query.trim().toLowerCase();
  return entries.filter(
    (e) => (status === 'all' || e.status === status) && (!q || e.name.toLowerCase().includes(q)),
  );
}

/** Entry count per status filter, limited to titles matching `query` so chips agree with the grid. */
export function statusCounts(
  entries: LibraryEntry[],
  query = '',
): Record<(typeof STATUS_FILTERS)[number], number> {
  const counts = { all: 0, playing: 0, backlog: 0, finished: 0, dropped: 0 };
  for (const e of filterLibrary(entries, { query, status: 'all' })) {
    counts.all += 1;
    counts[e.status] += 1;
  }
  return counts;
}

const STATUS_TONE: Record<Status, Tone> = {
  playing: 'yes',
  backlog: 'unknown',
  finished: 'unknown',
  dropped: 'no',
};

/** Plain HUD chips for a library card: status, then hours when known. */
export function entryChips(entry: LibraryEntry): Pick<HudChipProps, 'label' | 'tone' | 'plain'>[] {
  const chips: Pick<HudChipProps, 'label' | 'tone' | 'plain'>[] = [
    { label: STATUS_LABEL[entry.status], tone: STATUS_TONE[entry.status], plain: true },
  ];
  if (entry.hoursPlayed !== null) {
    chips.push({ label: formatHours(entry.hoursPlayed), tone: 'unknown', plain: true });
  }
  return chips;
}

const byTitle = (a: LibraryEntry, b: LibraryEntry) =>
  a.name.localeCompare(b.name, 'en', { sensitivity: 'base' });

/** Descending by a nullable number, nulls last, ties by title. */
function byNumberDesc(value: (e: LibraryEntry) => number | null) {
  return (a: LibraryEntry, b: LibraryEntry) => {
    const x = value(a);
    const y = value(b);
    if (x === y) return byTitle(a, b);
    if (x === null) return 1;
    if (y === null) return -1;
    return y - x;
  };
}

const time = (iso: string | null) => (iso ? new Date(iso).getTime() : null);

const COMPARE: Record<LibrarySort, (a: LibraryEntry, b: LibraryEntry) => number> = {
  recent: byNumberDesc((e) => time(e.lastPlayed)),
  hours: byNumberDesc((e) => e.hoursPlayed),
  title: byTitle,
  added: byNumberDesc((e) => time(e.addedAt)),
};

/** A sorted copy. */
export function sortLibrary(entries: LibraryEntry[], sort: LibrarySort): LibraryEntry[] {
  return [...entries].sort(COMPARE[sort]);
}

export function formatHours(hours: number | null): string {
  return hours === null ? 'No hours' : `${hours} h`;
}

const DATE = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

export function formatLastPlayed(iso: string | null, hours?: number | null): string {
  if (iso) return DATE.format(new Date(iso));
  return hours ? 'Last played unknown' : 'Never played';
}

export interface EntryForm {
  hours: string;
  /** `YYYY-MM-DD` or empty. */
  lastPlayed: string;
  status: Status;
}

export function toForm(entry: LibraryEntry): EntryForm {
  return {
    hours: entry.hoursPlayed === null ? '' : String(entry.hoursPlayed),
    lastPlayed: entry.lastPlayed?.slice(0, 10) ?? '',
    status: entry.status,
  };
}

/** `YYYY-MM-DD` that exists on the calendar (rejects 2026-02-30). */
function isRealDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

export const games = (n: number) => `${n} game${n === 1 ? '' : 's'}`;

export type PatchResult =
  { ok: true; patch: LibraryPatchInput | null } | { ok: false; error: string };

/** Only the fields that changed; `patch: null` when nothing did. Blank clears hours / date. */
export function buildPatch(entry: LibraryEntry, form: EntryForm): PatchResult {
  const patch: LibraryPatchInput = {};

  const hours = parseHours(form.hours);
  if (hours === null) return { ok: false, error: 'Enter hours as a number, like 12 or 1.5.' };
  if (hours !== (entry.hoursPlayed ?? undefined)) patch.hoursPlayed = hours ?? null;

  const date = form.lastPlayed.trim();
  if (date && !isRealDate(date)) return { ok: false, error: 'Enter a real date as YYYY-MM-DD.' };
  if (date !== (entry.lastPlayed?.slice(0, 10) ?? '')) patch.lastPlayed = date || null;

  if (form.status !== entry.status) patch.status = form.status;

  return { ok: true, patch: Object.keys(patch).length > 0 ? patch : null };
}
