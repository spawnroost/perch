import { Star } from 'lucide-react';
import { cn } from '@/lib/cn';
import {
  MAX_RATING,
  clickRating,
  rateFromKey,
  ratingLabel,
  tabStop,
  type Rating,
} from '@/lib/rating';

export interface RatingStarsProps {
  value: Rating;
  onChange: (rating: Rating) => void;
  /** Accessible name of the group. */
  label?: string;
  disabled?: boolean;
  className?: string;
}

const STARS = Array.from({ length: MAX_RATING }, (_, i) => i + 1);

/** 1-5 stars as a radio group: arrows and 1-5 set, 0 / Backspace / clicking the current star clears. */
export function RatingStars({
  value,
  onChange,
  label = 'Your rating',
  disabled,
  className,
}: RatingStarsProps) {
  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (disabled || e.altKey || e.ctrlKey || e.metaKey) return;
    const next = rateFromKey(value, e.key);
    if (next === undefined) return;
    e.preventDefault();
    onChange(next);
    const target = next ?? tabStop(null);
    e.currentTarget.querySelector<HTMLElement>(`[data-star="${target}"]`)?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-disabled={disabled || undefined}
      onKeyDown={onKeyDown}
      className={cn('inline-flex items-center gap-0.5', className)}
    >
      {STARS.map((n) => {
        const filled = value !== null && n <= value;
        return (
          <button
            key={n}
            type="button"
            role="radio"
            data-star={n}
            aria-checked={value === n}
            aria-label={ratingLabel(n)}
            tabIndex={n === tabStop(value) ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(clickRating(value, n))}
            className={cn(
              'inline-flex size-7 cursor-pointer items-center justify-center rounded-md transition-colors duration-fast ease-out hover:text-accent disabled:cursor-not-allowed disabled:opacity-50',
              filled ? 'text-accent' : 'text-fg-subtle',
            )}
          >
            <Star
              size={18}
              strokeWidth={1.75}
              fill={filled ? 'currentColor' : 'none'}
              aria-hidden
            />
          </button>
        );
      })}
    </div>
  );
}
