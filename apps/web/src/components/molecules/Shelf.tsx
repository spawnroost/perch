import { useRef, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/atoms/Button';
import { SectionHeading } from '@/components/atoms/SectionHeading';
import { useReduced } from '@/hooks/useMotionPrefs';
import { useScrollEdges } from '@/hooks/useScrollEdges';
import { cn } from '@/lib/cn';
import { nextFocusIndex, scrollStep } from '@/lib/shelf';

export type ShelfProps = {
  title: string;
  /** Cards marked with data-shelf-item (GameCard does this) take part in arrow-key navigation. */
  children: ReactNode;
  /** Show prev/next buttons in the header. */
  controls?: boolean;
  className?: string;
};

const ITEM = '[data-shelf-item]';

/** Titled horizontal row: scroll-snap, arrow-key focus movement, edge fades when scrollable. */
export function Shelf({ title, children, controls, className }: ShelfProps) {
  const reduced = useReduced();
  const scroller = useRef<HTMLDivElement>(null);
  const edges = useScrollEdges(scroller);
  const behavior = reduced ? 'auto' : 'smooth';

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const root = scroller.current;
    if (!root) return;
    const items = Array.from(root.querySelectorAll<HTMLElement>(ITEM));
    const current = items.findIndex((el) => el === e.target || el.contains(e.target as Node));
    // Keys inside a card's own controls (e.g. feedback buttons) are not shelf navigation.
    if (current === -1) return;
    const next = nextFocusIndex(current, e.key, items.length);
    if (next === null) return;
    e.preventDefault();
    const target = items[next];
    target?.focus();
    target?.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior });
  };

  const scrollBy = (direction: 'prev' | 'next') => {
    const root = scroller.current;
    if (root) root.scrollBy({ left: scrollStep(root.clientWidth, direction), behavior });
  };

  return (
    <section aria-label={title} className={cn('flex flex-col gap-3', className)}>
      <header className="relative z-10 flex items-center justify-between gap-3">
        <SectionHeading>{title}</SectionHeading>
        {controls ? (
          <div className="flex gap-1">
            <Button
              size="icon"
              variant="ghost"
              aria-label={`Scroll ${title} back`}
              aria-disabled={!edges.start}
              onClick={() => edges.start && scrollBy('prev')}
            >
              <ChevronLeft size={16} strokeWidth={1.75} aria-hidden />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              aria-label={`Scroll ${title} forward`}
              aria-disabled={!edges.end}
              onClick={() => edges.end && scrollBy('next')}
            >
              <ChevronRight size={16} strokeWidth={1.75} aria-hidden />
            </Button>
          </div>
        ) : null}
      </header>
      <div className="relative">
        {/* Vertical padding (offset by negative margin) leaves room for lift, tilt and glow; the header
            sits above it. The edge fade is a mask on the scroller (an overlay would paint under the
            3D-transformed cards); scroll-px-12 keeps snapped cards clear of it (shelf-fade is 3rem). */}
        <div
          ref={scroller}
          onKeyDown={onKeyDown}
          style={fadeStyle(edges)}
          className="shelf-fade -mx-2 -my-8 flex snap-x snap-proximity scroll-px-12 gap-4 overflow-x-auto px-2 py-8 [&>*]:shrink-0 [&>*]:snap-start"
        >
          {children}
        </div>
      </div>
    </section>
  );
}

function fadeStyle(edges: { start: boolean; end: boolean }): CSSProperties {
  return {
    '--fade-start': edges.start ? 'var(--fade-size)' : '0px',
    '--fade-end': edges.end ? 'var(--fade-size)' : '0px',
  } as CSSProperties;
}
