import { Search } from 'lucide-react';
import { Input, Select, Tabs, TabsList, TabsTrigger } from '../atoms';
import {
  SORT_LABEL,
  SORTS,
  STATUS_LABEL,
  STATUSES,
  type LibraryFilter,
  type LibrarySort,
} from '@/lib/library';

export interface LibraryControlsProps {
  filter: LibraryFilter;
  sort: LibrarySort;
  onFilter: (filter: LibraryFilter) => void;
  onSort: (sort: LibrarySort) => void;
}

export function LibraryControls({ filter, sort, onFilter, onSort }: LibraryControlsProps) {
  return (
    <div className="flex flex-col gap-2">
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
      <Tabs
        value={filter.status}
        onValueChange={(status) =>
          onFilter({ ...filter, status: status as LibraryFilter['status'] })
        }
      >
        <TabsList className="max-w-full overflow-x-auto">
          <TabsTrigger value="all">All</TabsTrigger>
          {STATUSES.map((s) => (
            <TabsTrigger key={s} value={s}>
              {STATUS_LABEL[s]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </div>
  );
}
