import { Search } from 'lucide-react';
import { Input, Select } from '../atoms';
import { cn } from '@/lib/cn';
import {
  SORT_LABEL,
  SORTS,
  STATUS_FILTERS,
  STATUS_LABEL,
  type LibraryFilter,
  type LibrarySort,
  type StatusFilter,
} from '@/lib/library';

export interface LibraryControlsProps {
  filter: LibraryFilter;
  sort: LibrarySort;
  /** Entries per status filter (see statusCounts). */
  counts: Record<StatusFilter, number>;
  onFilter: (filter: LibraryFilter) => void;
  onSort: (sort: LibrarySort) => void;
}

export function LibraryControls({ filter, sort, counts, onFilter, onSort }: LibraryControlsProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <Input
          icon={<Search size={14} strokeWidth={1.75} />}
          placeholder="Filter by title"
          aria-label="Filter library by title"
          value={filter.query}
          onChange={(e) => onFilter({ ...filter, query: e.target.value })}
          className="flex-1"
        />
        <Select
          aria-label="Sort library"
          value={sort}
          onChange={(e) => onSort(e.target.value as LibrarySort)}
          className="w-44"
        >
          {SORTS.map((s) => (
            <option key={s} value={s}>
              {SORT_LABEL[s]}
            </option>
          ))}
        </Select>
      </div>
      <div role="group" aria-label="Filter by status" className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((status) => {
          const active = filter.status === status;
          return (
            <button
              key={status}
              type="button"
              aria-pressed={active}
              onClick={() => onFilter({ ...filter, status })}
              className={cn(
                'font-hud inline-flex h-8 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm transition-colors duration-fast ease-out',
                active
                  ? 'border-accent bg-accent-soft text-fg'
                  : 'border-line bg-surface-1 text-fg-muted hover:bg-surface-2 hover:text-fg',
              )}
            >
              {status === 'all' ? 'All' : STATUS_LABEL[status]}
              <span className="tabular-nums text-fg-subtle">{counts[status]}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
