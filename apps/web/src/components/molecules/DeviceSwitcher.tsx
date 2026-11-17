import { useRef, type KeyboardEvent } from 'react';
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
          <button
            key={o.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            onClick={() => onChange(o.id)}
            className={cn(
              'h-8 shrink-0 cursor-pointer whitespace-nowrap rounded-md border px-3 text-sm font-medium transition-colors duration-fast ease-out',
              checked
                ? 'border-line-strong bg-surface-3 text-fg'
                : 'border-line bg-surface-1 text-fg-muted hover:text-fg',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
