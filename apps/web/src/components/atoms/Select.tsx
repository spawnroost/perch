import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

/** Native select styled like Input; keeps keyboard and mobile behaviour for free. */
export function Select({ className, ...props }: ComponentProps<'select'>) {
  return (
    <select
      className={cn(
        'h-8 w-full cursor-pointer rounded-md border border-line bg-surface-1 px-2.5 text-sm text-fg shadow-raised transition-colors duration-fast ease-out focus-visible:border-coral focus-visible:outline-2 focus-visible:outline-coral focus-visible:outline-offset-0 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}
