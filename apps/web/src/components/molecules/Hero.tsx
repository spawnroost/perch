import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useLoadedImage } from '@/hooks/useLoadedImage';
import { useReduced } from '@/hooks/useMotionPrefs';
import { accentStyle } from '@/lib/accent';
import { cn } from '@/lib/cn';
import { heroImageMotion } from '@/lib/motion';

export type HeroProps = {
  title: string;
  /** Heading level of the title; h2 when the page already has its own h1. */
  titleAs?: 'h1' | 'h2';
  /** Wide art for the backdrop; a plain accent wash is used when absent. */
  heroUrl?: string | null;
  accent?: string | null;
  /** Under the title: platform, year, genres, fit chips. */
  meta?: ReactNode;
  /** Box art beside the title (e.g. a shared-element cover on the detail view). */
  cover?: ReactNode;
  /** Pinned to the top-left of the art (e.g. a back link). */
  overlay?: ReactNode;
  /** Buttons row. */
  actions?: ReactNode;
  className?: string;
};

/** Full-bleed backdrop (blurred, accent-tinted, fading to the ground) with the title over it. */
export function Hero({
  title,
  titleAs: Title = 'h1',
  heroUrl,
  accent,
  meta,
  cover,
  actions,
  overlay,
  className,
}: HeroProps) {
  const art = heroImageMotion(useReduced());
  // The old art stays until the new art has loaded, then they crossfade.
  const shownUrl = useLoadedImage(heroUrl);
  return (
    <header
      style={accentStyle(accent)}
      className={cn(
        'relative isolate flex min-h-80 flex-col justify-end overflow-hidden',
        className,
      )}
    >
      <div aria-hidden className="absolute inset-0 -z-10 bg-surface-1">
        <div className="absolute inset-0 motion-safe:animate-hero-drift">
          <AnimatePresence mode="popLayout">
            {shownUrl ? (
              <motion.img
                key={shownUrl}
                src={shownUrl}
                alt=""
                loading="eager"
                fetchPriority="high"
                decoding="async"
                {...art}
                className="size-full object-cover blur-hero"
              />
            ) : null}
          </AnimatePresence>
        </div>
        {/* The accent lights the art from the lower left instead of recolouring it. */}
        <div
          className={cn(
            'absolute inset-0',
            heroUrl ? 'bg-radial-[at_0%_100%] from-accent-wash to-transparent' : 'bg-accent-wash',
          )}
        />
        <div className="absolute inset-0 bg-linear-to-t from-ground via-ground/50 via-30% to-transparent to-65%" />
        <div className="absolute inset-0 bg-linear-to-r from-ground/60 to-transparent to-45%" />
      </div>
      {overlay ? <div className="absolute top-4 left-gutter z-10">{overlay}</div> : null}
      <div className="flex flex-col items-start gap-4 px-gutter pt-20 pb-6 sm:flex-row sm:items-end sm:gap-6 sm:pt-24 sm:pb-8">
        {cover}
        <div className="flex w-full min-w-0 flex-col gap-3 sm:w-auto sm:gap-4">
          <Title className="font-title text-display-sm wrap-break-word text-fg sm:text-display-md md:text-display-lg">
            {title}
          </Title>
          {meta ? (
            <div className="flex flex-wrap items-center gap-2 text-fg-muted">{meta}</div>
          ) : null}
          {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
        </div>
      </div>
    </header>
  );
}
