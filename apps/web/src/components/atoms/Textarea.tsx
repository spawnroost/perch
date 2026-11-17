import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      className={cn(
        'min-h-32 w-full resize-y rounded-md border border-line bg-surface-1 px-3 py-2 text-sm text-fg shadow-raised transition-colors duration-fast ease-out placeholder:text-fg-subtle focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-0 aria-invalid:border-fit-no disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}
