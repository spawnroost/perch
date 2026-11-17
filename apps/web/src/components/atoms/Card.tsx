import type { ComponentProps } from 'react';
import { cva } from 'class-variance-authority';
import { cn } from '@/lib/cn';

export const cardVariants = cva('rounded-lg border border-line bg-surface-1 shadow-raised', {
  variants: {
    interactive: {
      true: 'cursor-pointer text-left transition-colors duration-fast ease-out hover:bg-surface-2 aria-pressed:border-accent aria-pressed:bg-accent-soft aria-pressed:ring-1 aria-pressed:ring-inset aria-pressed:ring-accent',
      false: '',
    },
  },
  defaultVariants: { interactive: false },
});

type CardOwnProps = { interactive?: false } & ComponentProps<'div'>;
type InteractiveCardProps = {
  interactive: true;
  /** Selection state; the card is a toggle button. */
  pressed?: boolean;
} & Omit<ComponentProps<'button'>, 'aria-pressed'>;

export type CardProps = CardOwnProps | InteractiveCardProps;

export function Card(props: CardProps) {
  if (props.interactive) {
    const { interactive, pressed, className, type = 'button', ...rest } = props;
    return (
      <button
        type={type}
        aria-pressed={pressed ?? false}
        className={cn(cardVariants({ interactive }), className)}
        {...rest}
      />
    );
  }
  const { interactive, className, ...rest } = props;
  return <div className={cn(cardVariants({ interactive }), className)} {...rest} />;
}
