import { useRef, type KeyboardEvent } from 'react';
import { FilterChip } from '../atoms';
import { cn } from '@/lib/cn';
import { nextFocusIndex } from '@/lib/shelf';
import type { DeviceOption } from '@/lib/forYou';

export type DeviceSwitcherProps = {
  options: readonly DeviceOption[];
  value: string;
  onChange: (id: string) => void;
  /** Accessible name of the group. */
  label: string;
  className?: string;
};

/** Single-choice radiogroup with roving tabindex: left/right arrows (and Home/End) move and select. */
export function DeviceSwitcher({
  options,
  value,
  onChange,
  label,
  className,
}: DeviceSwitcherProps) {
  // Nothing selected yet (a picker with no default): the first chip takes the tab stop.
  const anyChecked = options.some((o) => o.id === value);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const current = options.findIndex((o) => o.id === value);
    const next = nextFocusIndex(current, e.key, options.length);
    if (next === null) return;
    e.preventDefault();
    const option = options[next];
    if (option) onChange(option.id);
    refs.current[next]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn('no-scrollbar flex gap-2 overflow-x-auto py-1', className)}
    >
      {options.map((o, i) => {
        const checked = o.id === value;
        return (
          <FilterChip
            key={o.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            role="radio"
            aria-checked={checked}
            tabIndex={checked || (!anyChecked && i === 0) ? 0 : -1}
            active={checked}
            onClick={() => onChange(o.id)}
          >
            {o.label}
          </FilterChip>
        );
      })}
    </div>
  );
}
