import {
  useRef,
  useState,
  type ComponentProps,
  type FocusEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { Link } from 'react-router';
import { motion, useMotionValue, useSpring } from 'motion/react';
import { Cover } from '@/components/atoms/Cover';
import { HudChip, type HudChipProps } from '@/components/atoms/HudChip';
import { Skeleton } from '@/components/atoms/Skeleton';
import { useLauncherSpring, useReduced } from '@/hooks/useMotionPrefs';
import { accentStyle } from '@/lib/accent';
import { withCardWidth } from '@/lib/cardWidth';
import { cn } from '@/lib/cn';
import { coverImage } from '@/lib/coverSrcSet';
import { LIFT_PX, SPRINGS, tiltFromPointer } from '@/lib/motion';

export type GameCardProps = {
  title: string;
  coverUrl?: string | null;
  coverUrlSmall?: string | null;
  /** Per-game hex accent; unset falls back to the default accent. */
  accent?: string | null;
  chips?: Pick<HudChipProps, 'label' | 'tone' | 'plain' | 'srLabel'>[];
  /** Controls (e.g. feedback) over the cover corner: shown on hover and focus, always on touch. */
  actions?: ReactNode;
  /** Shared-element id on the cover, matched by the detail view's cover for the expand. */
  layoutId?: string;
  /** Makes the whole card a link (real anchor semantics); button props are then not applied. */
  to?: string;
  /** img sizes hint when the caller overrides the default card width. */
  sizes?: string;
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

/** The default card width (see lib/cardWidth) applies unless className sets one; COVER_SIZES must describe it. */
const COVER_SIZES = '(min-width: 1024px) 14rem, 10rem';

/**
 * Tall box-art card: the cover tilts toward the pointer, lifts and glows in the game's accent on
 * hover/focus. The shared-element wrapper stays flat (untransformed) so the expand measures true
 * boxes; the tilt and lift live on a child. The click target is an overlay button (named by the
 * title) so the optional `actions` can sit beside it without nesting interactive elements.
 */
export function GameCard({
  title,
  coverUrl,
  coverUrlSmall,
  accent,
  chips,
  actions,
  layoutId,
  to,
  sizes = COVER_SIZES,
  skeleton,
  className,
  ...props
}: GameCardProps) {
  const reduced = useReduced();
  const transition = useLauncherSpring('tilt');
  const faceRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  // Tilt is driven by motion values so pointer moves cause no React renders.
  const tiltX = useMotionValue(0);
  const tiltY = useMotionValue(0);
  const rotateX = useSpring(tiltX, SPRINGS.tilt);
  const rotateY = useSpring(tiltY, SPRINGS.tilt);

  if (skeleton) {
    return (
      <div aria-hidden className={cn('flex flex-col gap-2', withCardWidth(className), className)}>
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

  const handlePointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (reduced || e.pointerType === 'touch' || !faceRef.current) return;
    const tilt = tiltFromPointer(
      e.clientX,
      e.clientY,
      faceRef.current.getBoundingClientRect(),
      false,
    );
    tiltX.set(tilt.rotateX);
    tiltY.set(tilt.rotateY);
  };

  const handleFocus = (e: FocusEvent<HTMLDivElement>) => {
    if (e.target.matches(':focus-visible')) setFocused(true);
  };
  const handleBlur = (e: FocusEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false);
  };

  return (
    <div
      style={accentStyle(accent)}
      onPointerEnter={() => setHovered(true)}
      onPointerMove={handlePointerMove}
      onPointerLeave={() => {
        setHovered(false);
        resetTilt();
      }}
      onFocus={handleFocus}
      onBlur={handleBlur}
      className={cn(
        'group perspective-shelf relative flex flex-col gap-2',
        withCardWidth(className),
        className,
      )}
    >
      <motion.div layoutId={layoutId} className="w-full">
        <motion.div
          ref={faceRef}
          animate={{ y: lit && !reduced ? -LIFT_PX : 0 }}
          transition={transition}
          style={{ transformStyle: 'preserve-3d', rotateX, rotateY }}
        >
          <Cover
            src={image?.src ?? null}
            srcSet={image?.srcSet}
            sizes={sizes}
            alt=""
            className={cn(
              'w-full rounded-lg transition-shadow duration-base ease-out',
              lit && 'shadow-glow',
            )}
          />
        </motion.div>
      </motion.div>
      <span className="font-title text-lg leading-tight text-fg">{title}</span>
      {chips && chips.length > 0 ? (
        <span className="flex flex-nowrap gap-1 overflow-hidden">
          {chips.map((chip) => (
            <HudChip
              key={chip.label}
              {...chip}
              // Chips shrink and truncate so the trailing "+N" chip stays whole.
              className={chip.srLabel ? undefined : 'min-w-0 shrink'}
            />
          ))}
        </span>
      ) : null}
      {to ? (
        <Link
          to={to}
          data-shelf-item
          aria-label={title}
          className="absolute inset-0 z-10 rounded-lg outline-offset-4"
        />
      ) : (
        <button
          type="button"
          data-shelf-item
          aria-label={title}
          className="absolute inset-0 z-10 rounded-lg outline-offset-4"
          {...props}
        />
      )}
      {actions ? (
        <div className="absolute top-2 right-2 z-20 rounded-md bg-ground/80 opacity-0 transition-opacity duration-base ease-out group-focus-within:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100">
          {actions}
        </div>
      ) : null}
    </div>
  );
}
