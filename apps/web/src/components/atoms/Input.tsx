import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface InputProps extends ComponentProps<'input'> {
  /** Icon shown inside the leading edge. */
  icon?: ReactNode;
  /** Classes for the inner input when `icon` wraps it; `className` then styles the wrapper. */
  inputClassName?: string;
}

export function Input({ className, inputClassName, icon, ...props }: InputProps) {
  const input = (
    <input
      className={cn(
        'h-8 pointer-coarse:h-10 w-full rounded-md border border-line bg-surface-1 px-3 text-sm text-fg shadow-raised transition-colors duration-fast ease-out placeholder:text-fg-subtle focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-0 aria-invalid:border-fit-no aria-invalid:focus-visible:outline-fit-no disabled:cursor-not-allowed disabled:opacity-50',
        icon && 'pl-8',
        icon ? inputClassName : className,
      )}
      {...props}
    />
  );
  if (!icon) return input;
  return (
    <div className={cn('relative flex items-center', className)}>
      <span className="pointer-events-none absolute left-2.5 flex text-fg-subtle" aria-hidden>
        {icon}
      </span>
      {input}
    </div>
  );
}
