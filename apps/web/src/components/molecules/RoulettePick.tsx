import { motion } from 'motion/react';
import type { RouletteResponse } from '@perch/core/browser';
import { Cover, HudChip } from '../atoms';
import { useLauncherSpring, useReduced } from '@/hooks/useMotionPrefs';
import { accentStyle } from '@/lib/accent';
import { GLOW_PULSE, GLOW_PULSE_S, REVEAL_FADE_S, REVEAL_FROM, REVEAL_TO } from '@/lib/roulette';
import { timeToBeatLabel } from '@/lib/timeToBeat';

type Pick = NonNullable<RouletteResponse['pick']>;

/** The roulette's chosen game: cover on its accent glow, flipping up (or fading in when reduced). */
export function RoulettePick({ pick }: { pick: Pick }) {
  const reduced = useReduced();
  const spring = useLauncherSpring('expand');
  const { game } = pick;
  const length = timeToBeatLabel(pick.timeToBeat);
  return (
    <div
      style={accentStyle(game.accent)}
      className="perspective-shelf relative flex flex-col items-center gap-3 text-center"
    >
      {reduced ? null : (
        <motion.div
          aria-hidden
          className="absolute top-0 h-56 w-56 rounded-full bg-accent-wash blur-3xl"
          animate={{ opacity: [...GLOW_PULSE] }}
          transition={{ duration: GLOW_PULSE_S, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}
      <motion.div
        className="relative flex flex-col items-center gap-3"
        initial={reduced ? { opacity: 0 } : REVEAL_FROM}
        animate={REVEAL_TO}
        transition={reduced ? { duration: REVEAL_FADE_S } : spring}
      >
        <Cover
          src={game.coverUrl}
          alt={`${game.name} cover`}
          label={game.name}
          className="w-44 shadow-cover-glow"
        />
        <h3 className="font-title text-2xl text-fg">{game.name}</h3>
        <div className="flex flex-wrap justify-center gap-1.5">
          <HudChip label={pick.sessionReason} tone="yes" plain />
          {length ? <HudChip label={length} tone="unknown" plain /> : null}
        </div>
      </motion.div>
    </div>
  );
}
