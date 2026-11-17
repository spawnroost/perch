import { useReducedMotion } from 'motion/react';
import { resolveSpring, type SpringName, type SpringTransition } from '@/lib/motion';

/** Spring transition for the named launcher spring; instant when the user prefers reduced motion. */
export function useSpring(name: SpringName): SpringTransition {
  return resolveSpring(name, useReducedMotion() ?? false);
}

/** True when the user prefers reduced motion (also gates tilt and parallax). */
export function useReduced(): boolean {
  return useReducedMotion() ?? false;
}
