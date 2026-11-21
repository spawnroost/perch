import { motion } from 'motion/react';
import type { TasteSummary } from '@perch/core/browser';
import { Cover } from '../atoms';
import { useReduced } from '@/hooks/useMotionPrefs';
import { accentStyle } from '@/lib/accent';
import { cn } from '@/lib/cn';
import { collageLayout, reveal } from '@/lib/tasteCard';

/** Columns and rows are spelled out so Tailwind sees the class names. */
const COLS: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
};
const LG_COLS: Record<number, string> = {
  1: 'lg:grid-cols-1',
  2: 'lg:grid-cols-2',
  3: 'lg:grid-cols-3',
};
const LG_ROWS: Record<number, string> = {
  1: 'lg:grid-rows-1',
  2: 'lg:grid-rows-2',
  3: 'lg:grid-rows-3',
};
/** Phones show a one-row strip of this many covers. */
const STRIP_MAX = 4;

/**
 * Cover art of the player's favourite games; each cover pops in after the last. Phones: a strip of
 * the first few. From `lg`: the whole grid, filling the height its parent gives it.
 */
export function TasteCollage({
  covers,
  className,
}: {
  covers: TasteSummary['covers'];
  className?: string;
}) {
  const reduced = useReduced();
  const { cols, items } = collageLayout(covers);
  if (items.length === 0) return null;
  const rows = items.length / cols;
  return (
    <div
      className={cn(
        'grid gap-1.5 lg:min-h-0 lg:gap-2',
        COLS[Math.min(STRIP_MAX, items.length)],
        LG_COLS[cols],
        LG_ROWS[rows],
        className,
      )}
    >
      {items.map((c, i) => {
        const r = reveal(i, reduced);
        return (
          <motion.div
            key={c.igdbId}
            style={accentStyle(c.accent)}
            className={cn('lg:min-h-0', i >= STRIP_MAX && 'hidden lg:block')}
            initial={reduced ? false : { opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={r.transition}
          >
            <Cover
              src={c.coverUrl}
              alt=""
              label={c.name}
              className="shadow-glow lg:aspect-auto lg:size-full"
            />
          </motion.div>
        );
      })}
    </div>
  );
}
