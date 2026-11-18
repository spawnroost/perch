import type { BrowseResponse } from '@perch/core/browser';
import { deviceSearch, parseDevice } from './forYou';

/** Games per "Load more" page. */
export const BROWSE_LIMIT = 30;

export type BrowseGroup = 'genres' | 'themes';

/** What the browse page shows, all of it in the URL. */
export interface BrowseSelection {
  genres: number[];
  themes: number[];
  /** A device id, or All. */
  device: string;
}

/** "12,31" -> [12, 31]; anything that is not a positive integer is dropped, repeats too. */
function parseIds(value: string | null): number[] {
  const ids = (value ?? '').split(',').map((part) => (/^[1-9]\d*$/.test(part) ? Number(part) : 0));
  return [...new Set(ids.filter((id) => id > 0))];
}

export function browseSelection(params: URLSearchParams): BrowseSelection {
  return {
    genres: parseIds(params.get('genres')),
    themes: parseIds(params.get('themes')),
    device: parseDevice(params.get('device')),
  };
}

export const hasFilters = (sel: BrowseSelection): boolean =>
  sel.genres.length + sel.themes.length > 0;

/** Adds `id` when missing, removes it when present; the result is sorted. */
export function toggleId(ids: readonly number[], id: number): number[] {
  return (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]).sort((a, b) => a - b);
}

export function withToggled(sel: BrowseSelection, group: BrowseGroup, id: number): BrowseSelection {
  return { ...sel, [group]: toggleId(sel[group], id) };
}

/** The browse route for a selection. */
export function browsePath(sel: BrowseSelection): string {
  const parts: string[] = [];
  if (sel.genres.length > 0) parts.push(`genres=${sel.genres.join(',')}`);
  if (sel.themes.length > 0) parts.push(`themes=${sel.themes.join(',')}`);
  const device = deviceSearch(sel.device); // '?device=…' or ''
  if (device) parts.push(device.slice(1));
  return parts.length > 0 ? `/browse?${parts.join('&')}` : '/browse';
}

/** The `?…` query of a selection, as `setSearchParams` takes it. */
export const browseSearch = (sel: BrowseSelection): string =>
  browsePath(sel).slice('/browse'.length);

type PageLike = Pick<BrowseResponse, 'hasMore'> & { recommendations: readonly unknown[] };

/** The offset of the next page: games loaded so far while the last page reports more. */
export function nextOffset(last: PageLike, all: readonly PageLike[]): number | undefined {
  return last.hasMore ? all.reduce((n, p) => n + p.recommendations.length, 0) : undefined;
}
