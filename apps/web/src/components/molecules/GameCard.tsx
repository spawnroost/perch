import { useRef, useState, type ComponentProps, type PointerEvent } from 'react';
import { motion, useMotionValue, useSpring } from 'motion/react';
import { Cover } from '@/components/atoms/Cover';
import { HudChip, type HudChipProps } from '@/components/atoms/HudChip';
import { Skeleton } from '@/components/atoms/Skeleton';
import { useLauncherSpring, useReduced } from '@/hooks/useMotionPrefs';
import { accentStyle } from '@/lib/accent';
import { cn } from '@/lib/cn';
import { coverImage } from '@/lib/coverSrcSet';
import { LIFT_PX, SPRINGS, tiltFromPointer } from '@/lib/motion';

export type GameCardProps = {
  title: string;
  coverUrl?: string | null;
  coverUrlSmall?: string | null;
  /** Per-game hex accent; unset falls back to the default accent. */
  accent?: string | null;
  chips?: Pick<HudChipProps, 'label' | 'tone'>[];
  /** For a later shared-element expand into the detail view. */
  layoutId?: string;
  /** Shimmer placeholder while the game loads. */
  skeleton?: boolean;
  className?: string;
} & Omit<
  ComponentProps<'button'>,
  | 'children'
  | 'title'
  | 'className'
  | 'style'
  | 'onAnimationStart'
  | 'onDrag'
  | 'onDragStart'
  | 'onDragEnd'
>;

/** Default card width (callers may override it); COVER_SIZES must describe the same widths. */
const CARD_WIDTH = 'w-40 lg:w-56';
const COVER_SIZES = '(min-width: 1024px) 14rem, 10rem';

/** Tall box-art card: tilts toward the pointer, lifts and glows in the game's accent on hover/focus. */
export function GameCard({
  title,
  coverUrl,
  coverUrlSmall,
  accent,
  chips,
  layoutId,
  skeleton,
  className,
  onPointerEnter,
  onPointerMove,
  onPointerLeave,
  onFocus,
  onBlur,
  ...props
}: GameCardProps) {
  const reduced = useReduced();
  const transition = useLauncherSpring('tilt');
  const ref = useRef<HTMLButtonElement>(null);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  // Tilt is driven by motion values so pointer moves cause no React renders.
  const tiltX = useMotionValue(0);
  const tiltY = useMotionValue(0);
  const rotateX = useSpring(tiltX, SPRINGS.tilt);
  const rotateY = useSpring(tiltY, SPRINGS.tilt);

  if (skeleton) {
    return (
      <div aria-hidden className={cn('flex flex-col gap-2', CARD_WIDTH, className)}>
        <Skeleton className="aspect-3/4 w-full rounded-lg" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    );
  }

  const image = coverImage(coverUrl, coverUrlSmall);
  const lit = hovered || focused;

  const resetTilt = () => {
    tiltX.set(0);
    tiltY.set(0);
  };

  const handlePointerMove = (e: PointerEvent<HTMLButtonElement>) => {
    onPointerMove?.(e);
    if (reduced || e.pointerType === 'touch' || !ref.current) return;
    const tilt = tiltFromPointer(e.clientX, e.clientY, ref.current.getBoundingClientRect(), false);
    tiltX.set(tilt.rotateX);
    tiltY.set(tilt.rotateY);
  };

  return (
    <div style={accentStyle(accent)} className={cn('perspective-shelf', CARD_WIDTH, className)}>
      <motion.button
        ref={ref}
        type="button"
        data-shelf-item
        layoutId={layoutId}
        animate={{ y: lit && !reduced ? -LIFT_PX : 0 }}
        transition={transition}
        style={{ transformStyle: 'preserve-3d', rotateX, rotateY }}
        onPointerEnter={(e) => {
          setHovered(true);
          onPointerEnter?.(e);
        }}
        onPointerMove={handlePointerMove}
        onPointerLeave={(e) => {
          setHovered(false);
          resetTilt();
          onPointerLeave?.(e);
        }}
        onFocus={(e) => {
          if (e.currentTarget.matches(':focus-visible')) setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        className={cn('flex w-full flex-col gap-2 rounded-lg text-left outline-offset-4')}
        {...props}
      >
        <Cover
          src={image?.src ?? null}
          srcSet={image?.srcSet}
          sizes={COVER_SIZES}
          alt=""
          className={cn(
            'w-full rounded-lg transition-shadow duration-base ease-out',
            lit && 'shadow-glow',
          )}
        />
        <span className="font-title text-lg leading-tight text-fg">{title}</span>
        {chips && chips.length > 0 ? (
          <span className="flex flex-wrap gap-1">
            {chips.map((chip) => (
              <HudChip key={chip.label} {...chip} />
            ))}
          </span>
        ) : null}
      </motion.button>
    </div>
  );
}
