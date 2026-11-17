import { useRef, useState, type ComponentProps, type PointerEvent } from 'react';
import { motion } from 'motion/react';
import { Cover } from '@/components/atoms/Cover';
import { HudChip, type HudChipProps } from '@/components/atoms/HudChip';
import { Skeleton } from '@/components/atoms/Skeleton';
import { useLauncherSpring, useReduced } from '@/hooks/useMotionPrefs';
import { accentStyle } from '@/lib/accent';
import { cn } from '@/lib/cn';
import { coverImage } from '@/lib/coverSrcSet';
import { LIFT_PX, tiltFromPointer } from '@/lib/motion';

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

const FLAT = { rotateX: 0, rotateY: 0, y: 0 };
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
  ...props
}: GameCardProps) {
  const reduced = useReduced();
  const transition = useLauncherSpring('tilt');
  const ref = useRef<HTMLButtonElement>(null);
  const [pose, setPose] = useState(FLAT);
  const [lit, setLit] = useState(false);

  if (skeleton) {
    return (
      <div aria-hidden className={cn('flex flex-col gap-2', className)}>
        <Skeleton className="aspect-3/4 w-full rounded-lg" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    );
  }

  const image = coverImage(coverUrl, coverUrlSmall);
  const lift = reduced ? 0 : -LIFT_PX;

  const onPointerMove = (e: PointerEvent<HTMLButtonElement>) => {
    if (reduced || e.pointerType === 'touch' || !ref.current) return;
    const tilt = tiltFromPointer(e.clientX, e.clientY, ref.current.getBoundingClientRect(), false);
    setPose({ ...tilt, y: lift });
  };

  return (
    <div style={accentStyle(accent)} className={cn('perspective-shelf', className)}>
      <motion.button
        ref={ref}
        type="button"
        data-shelf-item
        layoutId={layoutId}
        animate={pose}
        transition={transition}
        style={{ transformStyle: 'preserve-3d' }}
        onPointerEnter={() => {
          setLit(true);
          setPose((p) => ({ ...p, y: lift }));
        }}
        onPointerMove={onPointerMove}
        onPointerLeave={() => {
          setLit(false);
          setPose(FLAT);
        }}
        onFocus={(e) => {
          if (!e.currentTarget.matches(':focus-visible')) return;
          setLit(true);
          setPose((p) => ({ ...p, y: lift }));
        }}
        onBlur={() => {
          setLit(false);
          setPose(FLAT);
        }}
        className={cn('flex w-full flex-col gap-2 rounded-lg text-left outline-offset-4')}
        {...props}
      >
        <Cover
          src={image?.src ?? null}
          srcSet={image?.srcSet}
          sizes={COVER_SIZES}
          alt={image ? `${title} cover` : title}
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
