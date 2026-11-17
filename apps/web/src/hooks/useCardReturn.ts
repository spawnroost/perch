import { useNavigationType } from 'react-router';
import { useReduced } from '@/hooks/useMotionPrefs';
import { coverLayoutId } from '@/lib/motion';

/**
 * Card props for a grid or shelf that a detail page can return to. Coming back by history (POP) the
 * cover would fly into a card that may be clipped or off-screen, so the cards fade in instead of
 * sharing the cover.
 */
export function useCardReturn() {
  const reduced = useReduced();
  const popped = useNavigationType() === 'POP';
  return {
    fadeIn: popped,
    /** The shared-element id for a game's cover; unset on history back and when motion is reduced. */
    coverId: (igdbId: number) => coverLayoutId(igdbId, reduced, popped),
  };
}
