import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

export type SwitchProps = Omit<ComponentProps<'button'>, 'type' | 'role' | 'onChange'> & {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
};

/** On/off toggle (role="switch"). Name it with `aria-labelledby` or `aria-label`. */
export function Switch({ checked, onCheckedChange, className, ...props }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border transition-colors duration-fast ease-out disabled:cursor-not-allowed disabled:opacity-60',
        checked ? 'border-accent bg-accent' : 'border-line bg-surface-2',
        className,
      )}
      {...props}
    >
      <span
        aria-hidden
        className={cn(
          'size-4 rounded-full bg-fg transition-transform duration-fast ease-out',
          checked ? 'translate-x-6' : 'translate-x-1',
        )}
      />
    </button>
  );
}
