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

export function resolveSpring(name: SpringName, reduced: boolean): SpringTransition {
  if (reduced) return { type: 'tween', duration: 0 };
  return { type: 'spring', ...SPRINGS[name] };
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
