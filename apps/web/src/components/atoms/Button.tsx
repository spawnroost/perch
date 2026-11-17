import type { ComponentProps, MouseEvent } from 'react';
import { Slot, Slottable } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Kbd } from './Kbd';

export const buttonVariants = cva(
  'inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors duration-fast ease-out disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-accent text-on-accent hover:bg-accent-hover active:bg-accent-press',
        secondary:
          'border border-line bg-surface-2 text-fg shadow-raised hover:bg-surface-3 active:bg-surface-2',
        ghost: 'text-fg-muted hover:bg-surface-2 hover:text-fg active:bg-surface-3',
        danger: 'bg-fit-no-soft text-fit-no hover:bg-surface-2 active:bg-surface-3',
        link: 'rounded-sm text-fg underline underline-offset-4 hover:text-fg-muted',
      },
      size: {
        sm: 'h-7 px-2.5',
        md: 'h-8 px-3',
        icon: 'size-8',
      },
    },
    compoundVariants: [{ variant: 'link', className: 'h-auto px-0' }],
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
);

export interface ButtonProps extends ComponentProps<'button'>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
  /** Keyboard shortcut hint rendered at the end. */
  kbd?: string;
}

export function Button({
  className,
  variant,
  size,
  asChild = false,
  loading = false,
  kbd,
  disabled,
  children,
  type = 'button',
  onClick,
  tabIndex,
  ...props
}: ButtonProps) {
  const classes = cn(buttonVariants({ variant, size }), className);
  const inactive = disabled || loading;
  const spinner = loading && (
    <Loader2 size={14} strokeWidth={1.75} className="animate-spin" aria-hidden />
  );
  const kbdHint = kbd && <Kbd>{kbd}</Kbd>;

  if (asChild) {
    return (
      <Slot
        className={classes}
        aria-disabled={inactive || undefined}
        aria-busy={loading || undefined}
        data-disabled={inactive ? '' : undefined}
        tabIndex={inactive ? -1 : tabIndex}
        onClick={
          inactive
            ? (e: MouseEvent<HTMLElement>) => {
                e.preventDefault();
                e.stopPropagation();
              }
            : onClick
        }
        {...props}
      >
        {spinner}
        <Slottable>{children}</Slottable>
        {kbdHint}
      </Slot>
    );
  }
  return (
    <button
      type={type}
      className={classes}
      disabled={inactive}
      aria-busy={loading || undefined}
      tabIndex={tabIndex}
      onClick={onClick}
      {...props}
    >
      {spinner}
      {children}
      {kbdHint}
    </button>
  );
}
