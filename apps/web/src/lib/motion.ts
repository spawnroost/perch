/*
 * Motion constants and pure helpers. Spring constants live here (they feed the motion library, not
 * CSS); durations and easings for CSS live in styles/tokens.css. Reduced motion collapses every
 * spring to an instant change and removes tilt, so layout transitions still land, just without travel.
 */

export type SpringName = 'expand' | 'snap' | 'hero' | 'tilt';

export type SpringConfig = { stiffness: number; damping: number; mass: number };

/** Damping ratio stays at or above 0.7: quick settle, at most a hint of overshoot. */
export const SPRINGS: Record<SpringName, SpringConfig> = {
  /** Card to detail (shared layout). */
  expand: { stiffness: 260, damping: 30, mass: 1 },
  /** Small state changes: chips, focus ring travel. */
  snap: { stiffness: 520, damping: 38, mass: 1 },
  /** Hero art and accent crossfade when the focused game changes. */
  hero: { stiffness: 120, damping: 22, mass: 1 },
  /** Hover tilt following the pointer. */
  tilt: { stiffness: 300, damping: 30, mass: 1 },
};

/** Largest card tilt in degrees. */
export const TILT_MAX_DEG = 8;
/** How far the card lifts toward the viewer on hover, in px. */
export const LIFT_PX = 6;

export type SpringTransition = ({ type: 'spring' } & SpringConfig) | { type: 'tween'; duration: 0 };

const INSTANT: SpringTransition = { type: 'tween', duration: 0 };

const SPRING_TRANSITIONS: Record<SpringName, SpringTransition> = {
  expand: { type: 'spring', ...SPRINGS.expand },
  snap: { type: 'spring', ...SPRINGS.snap },
  hero: { type: 'spring', ...SPRINGS.hero },
  tilt: { type: 'spring', ...SPRINGS.tilt },
};

/** Shared, stable objects: safe to pass as props without re-triggering effects. */
export function resolveSpring(name: SpringName, reduced: boolean): SpringTransition {
  return reduced ? INSTANT : SPRING_TRANSITIONS[name];
}

export type Tilt = { rotateX: number; rotateY: number };
type Rect = { left: number; top: number; width: number; height: number };

const clamp = (n: number) => Math.min(1, Math.max(-1, n));

/** Card rotation toward the pointer: right edge tilts +Y, top edge tilts +X. Flat when reduced. */
export function tiltFromPointer(x: number, y: number, rect: Rect, reduced: boolean): Tilt {
  if (reduced || rect.width <= 0 || rect.height <= 0) return { rotateX: 0, rotateY: 0 };
  const dx = clamp(((x - rect.left) / rect.width) * 2 - 1);
  const dy = clamp(((y - rect.top) / rect.height) * 2 - 1);
  return { rotateX: -dy * TILT_MAX_DEG || 0, rotateY: dx * TILT_MAX_DEG || 0 };
}

/** Shared-element id linking a card's cover to the detail cover; unset when reduced (no layout animation). */
export function coverLayoutId(
  igdbId: number,
  reduced: boolean,
  suppressed = false,
): string | undefined {
  return reduced || suppressed ? undefined : `cover-${igdbId}`;
}

/** Opacity tween lengths in ms: ordinary fades, the shorter reduced-motion fade, and cards returning on history back. */
export const FADE_MS = { base: 200, reduced: 120, cards: 150 } as const;

export type FadeTransition = { type: 'tween'; duration: number };

const FADES = new Map<number, FadeTransition>();

/** Opacity-only tween (no transforms); reduced motion always uses the shorter `FADE_MS.reduced`. */
export function fadeTransition(reduced: boolean, ms: number = FADE_MS.base): FadeTransition {
  const key = reduced ? FADE_MS.reduced : ms;
  let t = FADES.get(key);
  if (!t) {
    t = { type: 'tween', duration: key / 1000 };
    FADES.set(key, t);
  }
  return t;
}

/** Resting scale of the hero art (hides the blurred edge); the entrance starts a touch larger. */
export const HERO_SCALE = 1.08;
const HERO_ENTER_SCALE = 1.1;

/** Hero image entrance and exit: opacity tween plus a subtle settle; opacity only when reduced. */
export function heroImageMotion(reduced: boolean) {
  return {
    initial: { opacity: 0, scale: reduced ? HERO_SCALE : HERO_ENTER_SCALE },
    animate: { opacity: 1, scale: HERO_SCALE },
    exit: { opacity: 0 },
    transition: fadeTransition(reduced),
  };
}

/**
 * The first item for each game id. A shared-element layoutId must be unique on screen, so only
 * these items carry it; later repeats (same game on another shelf or platform) open without the expand.
 */
export function firstOfEach<T>(items: readonly T[], idOf: (item: T) => number): Set<T> {
  const seen = new Set<number>();
  const firsts = new Set<T>();
  for (const item of items) {
    const id = idOf(item);
    if (seen.has(id)) continue;
    seen.add(id);
    firsts.add(item);
  }
  return firsts;
}
