import { useLibrary, useRateGame } from './queries';
import { gameRating } from '@/lib/library';
import type { Rating } from '@/lib/rating';

/**
 * The user's rating of one game and a setter. The value read is the optimistic cache, so a
 * repeated click compares against what the user already sees; the stars lock while saving.
 */
export function useGameRating(igdbId: number) {
  const library = useLibrary();
  const mutation = useRateGame();
  const entries = library.data ?? [];
  const inLibrary = entries.some((e) => e.igdbId === igdbId);
  const rating = gameRating(entries, igdbId);

  function rate(next: Rating) {
    if (mutation.isPending || next === rating) return;
    mutation.mutate({ igdbId, rating: next });
  }

  return { inLibrary, rating, rate, pending: mutation.isPending, error: mutation.error };
}
