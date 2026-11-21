import { motion } from 'motion/react';
import { useReduced } from '@/hooks/useMotionPrefs';
import { cn } from '@/lib/cn';
import { reveal } from '@/lib/tasteCard';

/** A named bar filled to `weight` (0-1); it grows into place unless motion is reduced. */
export function TasteBar({
  name,
  weight,
  index,
  className,
}: {
  name: string;
  weight: number;
  index: number;
  className?: string;
}) {
  const reduced = useReduced();
  const grow = reveal(index, reduced);
  return (
    <div className={cn('flex items-center gap-2 text-sm', className)}>
      <span className="w-28 shrink-0 truncate text-fg">{name}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-sm bg-surface-3">
        <motion.div
          className="h-full origin-left rounded-sm bg-accent"
          style={{ width: `${Math.round(weight * 100)}%` }}
          initial={reduced ? false : { scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={grow.transition}
        />
      </div>
    </div>
  );
}
