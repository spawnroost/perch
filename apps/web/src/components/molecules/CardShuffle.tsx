import { motion } from 'motion/react';
import { Dices } from 'lucide-react';
import { useReduced } from '@/hooks/useMotionPrefs';
import { SHUFFLE_CARDS, SHUFFLE_LOOP_S } from '@/lib/roulette';

const CARD_BACK =
  'absolute inset-0 flex aspect-3/4 items-center justify-center rounded-md border border-line-strong bg-linear-to-br from-accent-tint to-surface-3 shadow-card';

/** A stack of card backs that swing and swap while the roulette decides; one still card when reduced. */
export function CardShuffle() {
  const reduced = useReduced();
  return (
    <div role="presentation" className="relative aspect-3/4 w-44">
      {reduced ? (
        <div className={CARD_BACK}>
          <Dices size={32} strokeWidth={1.5} className="text-fg-muted" aria-hidden />
        </div>
      ) : (
        SHUFFLE_CARDS.map((card, i) => (
          <motion.div
            key={i}
            className={CARD_BACK}
            style={{ zIndex: SHUFFLE_CARDS.length - i }}
            animate={{ x: [...card.x], rotate: [...card.rotate] }}
            transition={{
              duration: SHUFFLE_LOOP_S,
              delay: card.delay,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          >
            <Dices size={32} strokeWidth={1.5} className="text-fg-muted" aria-hidden />
          </motion.div>
        ))
      )}
    </div>
  );
}
