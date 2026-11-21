import { useEffect, useState } from 'react';
import { useRouletteSpin } from './queries';
import { useReduced } from './useMotionPrefs';
import {
  NO_FILTERS,
  readRecentPicks,
  rememberPick,
  rouletteParams,
  type RouletteFilters,
} from '@/lib/roulette';

/** How long the cards shuffle before a pick is revealed, even when the answer is already in. */
export const SHUFFLE_MS = 1100;

/** How long a spin may take before the dialog admits it is still waiting on the answer. */
export const SLOW_MS = 3000;

const storage = () => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

/**
 * State of one roulette session: the chosen filters, a spin counter, and whether the shuffle has
 * run long enough to reveal. Each spin skips the last few picks (kept in localStorage) and, once
 * its answer is in, adds its game to them. Changing a filter spins again.
 */
export function useRoulette() {
  const reduced = useReduced();
  const [filters, setFilters] = useState<RouletteFilters>(NO_FILTERS);
  // The exclusions are read when a spin starts, so the pick it makes does not exclude itself.
  const [spin, setSpin] = useState(() => ({ n: 1, exclude: readRecentPicks(storage()) }));
  const [shuffled, setShuffled] = useState(false);
  const query = useRouletteSpin(spin.n, rouletteParams(filters, spin.exclude));

  useEffect(() => {
    setShuffled(false);
    const timer = setTimeout(() => setShuffled(true), reduced ? 0 : SHUFFLE_MS);
    return () => clearTimeout(timer);
  }, [spin.n, reduced]);

  const [slow, setSlow] = useState(false);
  useEffect(() => {
    setSlow(false);
    const timer = setTimeout(() => setSlow(true), SLOW_MS);
    return () => clearTimeout(timer);
  }, [spin.n]);

  const picked = query.data?.pick?.game.igdbId;
  useEffect(() => {
    if (picked !== undefined) rememberPick(storage(), picked);
  }, [picked]);

  const respin = () => setSpin((s) => ({ n: s.n + 1, exclude: readRecentPicks(storage()) }));
  const choose = (patch: Partial<RouletteFilters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    respin();
  };

  return {
    filters,
    choose,
    respin,
    spinId: spin.n,
    /** Shuffling until both the answer and the shuffle time are in. */
    shuffling: !shuffled || query.isPending,
    /** The request is still out well after the shuffle should have ended. */
    slow: slow && query.isPending,
    result: query.data,
    error: query.isError ? query.error : null,
    retry: respin,
  };
}
