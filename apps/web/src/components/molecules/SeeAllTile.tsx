import { Link } from 'react-router';
import { ArrowRight } from 'lucide-react';
import { withCardWidth } from '@/lib/cardWidth';
import { cn } from '@/lib/cn';

export type SeeAllTileProps = {
  /** The shelf it opens, named for screen readers ("See all Short sessions"). */
  label: string;
  to: string;
  className?: string;
};

/** Last tile of a shelf: cover-sized, links to the shelf's full grid. Takes part in shelf arrow-key navigation. */
export function SeeAllTile({ label, to, className }: SeeAllTileProps) {
  return (
    <Link
      to={to}
      data-shelf-item
      aria-label={`See all ${label}`}
      className={cn(
        'flex aspect-3/4 flex-col items-center justify-center gap-2 self-start rounded-lg border border-line bg-surface-1 font-hud text-sm text-fg-muted',
        'transition-colors duration-150 hover:bg-surface-2 hover:text-fg motion-reduce:transition-none',
        withCardWidth(className),
        className,
      )}
    >
      See all
      <ArrowRight size={16} strokeWidth={1.75} aria-hidden />
    </Link>
  );
}
