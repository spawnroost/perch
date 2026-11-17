import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/atoms/Button';
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
      <header className="flex items-center justify-between gap-3">
        <h2 className="font-hud text-sm text-fg-muted">{title}</h2>
        {controls ? (
          <div className="flex gap-1">
            <Button
              size="icon"
              variant="ghost"
              aria-label={`Scroll ${title} back`}
              disabled={!edges.start}
              onClick={() => scrollBy('prev')}
            >
              <ChevronLeft size={16} strokeWidth={1.75} aria-hidden />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              aria-label={`Scroll ${title} forward`}
              disabled={!edges.end}
              onClick={() => scrollBy('next')}
            >
              <ChevronRight size={16} strokeWidth={1.75} aria-hidden />
            </Button>
          </div>
        ) : null}
      </header>
      <div className="relative">
        {/* Vertical padding (offset by negative margin) leaves room for lift, tilt and glow. */}
        <div
          ref={scroller}
          onKeyDown={onKeyDown}
          className="-my-8 flex snap-x snap-proximity gap-4 overflow-x-auto px-2 py-8 [&>*]:shrink-0 [&>*]:snap-start"
        >
          {children}
        </div>
        <Fade side="start" visible={edges.start} />
        <Fade side="end" visible={edges.end} />
      </div>
    </section>
  );
}

function Fade({ side, visible }: { side: 'start' | 'end'; visible: boolean }) {
  return (
    <div
      aria-hidden
      className={cn(
        'pointer-events-none absolute inset-y-0 w-12 from-ground to-transparent transition-opacity duration-base ease-out',
        side === 'start' ? 'left-0 bg-linear-to-r' : 'right-0 bg-linear-to-l',
        visible ? 'opacity-100' : 'opacity-0',
      )}
    />
  );
}
