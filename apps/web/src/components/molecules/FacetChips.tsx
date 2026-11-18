import { FilterChip, SectionHeading } from '../atoms';
import { cn } from '@/lib/cn';

export type FacetChipsProps = {
  /** Heading of the group, also its accessible name. */
  label: string;
  options: readonly { id: number; name: string }[];
  selected: readonly number[];
  onToggle: (id: number) => void;
  className?: string;
};

/** A multi-select row of toggle chips (genres, themes): one scroll row on phones, wrapped above. */
export function FacetChips({ label, options, selected, onToggle, className }: FacetChipsProps) {
  return (
    <div role="group" aria-label={label} className={cn('flex flex-col gap-2', className)}>
      <SectionHeading className="text-fg-muted">{label}</SectionHeading>
      <div className="no-scrollbar flex gap-2 overflow-x-auto py-1 sm:flex-wrap sm:overflow-visible">
        {options.map((o) => {
          const on = selected.includes(o.id);
          return (
            <FilterChip key={o.id} active={on} aria-pressed={on} onClick={() => onToggle(o.id)}>
              {o.name}
            </FilterChip>
          );
        })}
      </div>
    </div>
  );
}
