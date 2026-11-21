import { motion } from 'motion/react';
import type { TasteSummary } from '@perch/core/browser';
import { Cover } from '../atoms';
import { useReduced } from '@/hooks/useMotionPrefs';
import { accentStyle } from '@/lib/accent';
import { cn } from '@/lib/cn';
import { collageLayout, reveal } from '@/lib/tasteCard';

const COLS: Record<number, string> = { 1: 'grid-cols-1', 2: 'grid-cols-2', 3: 'grid-cols-3' };

/** Cover art of the player's favourite games in a tight grid; each cover pops in after the last. */
export function TasteCollage({ covers }: { covers: TasteSummary['covers'] }) {
  const reduced = useReduced();
  const { cols, items } = collageLayout(covers);
  if (items.length === 0) return null;
  return (
    <div className={cn('grid gap-1.5', COLS[cols])}>
      {items.map((c, i) => {
        const r = reveal(i, reduced);
        return (
          <motion.div
            key={c.igdbId}
            style={accentStyle(c.accent)}
            initial={reduced ? false : { opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={r.transition}
          >
            <Cover src={c.coverUrl} alt="" label={c.name} className="shadow-glow" />
          </motion.div>
        );
      })}
    </div>
  );
}
