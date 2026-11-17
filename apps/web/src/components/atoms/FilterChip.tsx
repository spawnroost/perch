import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

export type FilterChipProps = Omit<ComponentProps<'button'>, 'type'> & {
  /** Selected state styling; set the matching aria (pressed or checked) on the caller's role. */
  active: boolean;
};

/** Pill toggle in the HUD face: library status filters, device and minute choosers. */
export function FilterChip({ active, className, ...props }: FilterChipProps) {
  return (
    <button
      type="button"
      className={cn(
        'font-hud inline-flex h-8 shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap rounded-md border px-3 text-sm transition-colors duration-fast ease-out',
        active
          ? 'border-accent bg-accent-soft text-fg'
          : 'border-line bg-surface-1 text-fg-muted hover:bg-surface-2 hover:text-fg',
        className,
      )}
      {...props}
    />
  );
}
