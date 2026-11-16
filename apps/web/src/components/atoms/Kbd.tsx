import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

export function Kbd({ className, ...props }: ComponentProps<'kbd'>) {
  return (
    <kbd
      className={cn(
        'inline-flex h-4 min-w-4 items-center justify-center rounded-sm border border-line bg-surface-2 px-1 font-mono text-2xs tabular-nums text-fg-muted',
        className,
      )}
      {...props}
    />
  );
}
