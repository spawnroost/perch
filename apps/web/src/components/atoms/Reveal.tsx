import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import { useReduced } from '@/hooks/useMotionPrefs';
import { reveal } from '@/lib/tasteCard';

/** Fades and rises into place after `index` steps of stagger; appears at once when motion is reduced. */
export function Reveal({
  index,
  className,
  children,
}: {
  index: number;
  className?: string;
  children: ReactNode;
}) {
  const reduced = useReduced();
  return (
    <motion.div className={className} {...reveal(index, reduced)}>
      {children}
    </motion.div>
  );
}
