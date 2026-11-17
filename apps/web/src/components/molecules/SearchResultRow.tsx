import { Cover, Skeleton } from '../atoms';
import { FitChips } from './FitChips';
import { coverImage } from '@/lib/coverSrcSet';
import { cn } from '@/lib/cn';
import type { DeviceFit } from '@/lib/forYou';

export interface SearchResultRowProps {
  id: string;
  name: string;
  year?: number;
  coverUrl?: string | null;
  coverUrlSmall?: string | null;
  /** Per-device fit; undefined until loaded (or when it failed). */
  fits?: readonly DeviceFit[];
  fitLoading: boolean;
  active: boolean;
  onSelect: () => void;
  onHover: () => void;
}

const COVER_SIZES = '3rem';

/** A global-search listbox option: cover, name, year and lazily filled per-device fit chips. */
export function SearchResultRow({
  id,
  name,
  year,
  coverUrl,
  coverUrlSmall,
  fits,
  fitLoading,
  active,
  onSelect,
  onHover,
}: SearchResultRowProps) {
  const image = coverImage(coverUrl, coverUrlSmall);
  return (
    <li
      id={id}
      role="option"
      aria-selected={active}
      onClick={onSelect}
      onMouseMove={onHover}
      className={cn(
        'flex cursor-pointer items-center gap-3 rounded-lg p-2 transition-colors duration-fast ease-out',
        active ? 'bg-surface-3' : 'bg-transparent',
      )}
    >
      <Cover
        src={image?.src ?? null}
        srcSet={image?.srcSet}
        sizes={COVER_SIZES}
        alt=""
        className="w-12 shrink-0"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p className="truncate text-base text-fg">
          {name}
          {year && <span className="ml-2 text-xs text-fg-subtle tabular-nums">{year}</span>}
        </p>
        {fitLoading && <Skeleton className="h-5 w-24 rounded-sm" />}
        {fits && <FitChips fits={fits} />}
      </div>
    </li>
  );
}
