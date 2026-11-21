import type { ReactNode } from 'react';
import { ExternalLink } from 'lucide-react';
import { Badge } from '../atoms';

export interface PriceTileProps {
  /** Small caption above the price, e.g. "Best price now". */
  label: string;
  price: string;
  /** Store name, or the month of a historic low. */
  caption: ReactNode;
  /** Struck-through price before the discount. */
  was?: string | null;
  discount?: string | null;
  /** Makes the whole tile an external link. */
  href?: string | null;
}

const TILE =
  'flex min-w-0 flex-col gap-0.5 rounded-lg border border-line bg-surface-1 p-3 shadow-raised';

/** HUD price tile: label, big price with the old price and discount, and a caption line. */
export function PriceTile({ label, price, caption, was, discount, href }: PriceTileProps) {
  const body = (
    <>
      <span className="flex items-center justify-between gap-2 font-hud text-2xs text-fg-subtle">
        {label}
        {href ? <ExternalLink size={12} strokeWidth={1.75} aria-hidden /> : null}
      </span>
      <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="font-hud text-3xl text-accent tabular-nums">{price}</span>
        {discount ? <Badge tone="yes">{discount}</Badge> : null}
        {was ? (
          <s className="text-xs text-fg-subtle tabular-nums">
            <span className="sr-only">Was </span>
            {was}
          </s>
        ) : null}
      </span>
      <span className="text-sm text-fg">{caption}</span>
    </>
  );
  if (!href) return <div className={TILE}>{body}</div>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`${TILE} transition-colors duration-fast ease-out hover:bg-surface-2`}
    >
      {body}
    </a>
  );
}
