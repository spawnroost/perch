import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import { useLauncherSpring } from '@/hooks/useMotionPrefs';
import { accentStyle } from '@/lib/accent';
import { cn } from '@/lib/cn';

export type HeroProps = {
  title: string;
  /** Wide art for the backdrop; a plain accent wash is used when absent. */
  heroUrl?: string | null;
  accent?: string | null;
  /** Under the title: platform, year, genres, fit chips. */
  meta?: ReactNode;
  /** Buttons row. */
  actions?: ReactNode;
  className?: string;
};

/** Full-bleed backdrop (blurred, accent-tinted, fading to the ground) with the title over it. */
export function Hero({ title, heroUrl, accent, meta, actions, className }: HeroProps) {
  const transition = useLauncherSpring('hero');
  return (
    <header
      style={accentStyle(accent)}
      className={cn(
        'relative isolate flex min-h-80 flex-col justify-end overflow-hidden',
        className,
      )}
    >
      <div aria-hidden className="absolute inset-0 -z-10 bg-surface-1">
        {heroUrl ? (
          <motion.img
            key={heroUrl}
            src={heroUrl}
            alt=""
            decoding="async"
            initial={{ opacity: 0, scale: 1.12 }}
            animate={{ opacity: 1, scale: 1.08 }}
            transition={transition}
            className="size-full object-cover blur-hero"
          />
        ) : null}
        <div className={cn('absolute inset-0 bg-accent-wash', heroUrl && 'mix-blend-color')} />
        <div className="absolute inset-0 bg-linear-to-t from-ground via-ground/70 to-transparent" />
        <div className="absolute inset-0 bg-linear-to-r from-ground/80 to-transparent" />
      </div>
      <div className="flex flex-col gap-4 px-8 pt-24 pb-8">
        <h1 className="font-title text-display-lg text-fg">{title}</h1>
        {meta ? (
          <div className="flex flex-wrap items-center gap-2 text-fg-muted">{meta}</div>
        ) : null}
        {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
      </div>
    </header>
  );
}
