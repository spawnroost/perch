import { Notice, RatingStars } from '../atoms';
import { DetailSection } from '../molecules';
import { useLibrary, useUpdateLibraryEntry } from '@/hooks/queries';
import { entriesToRate, gameRating } from '@/lib/library';
import type { Rating } from '@/lib/rating';

/** Rail block to rate a game in the library; renders nothing when it is not there. */
export function GameRating({ igdbId }: { igdbId: number }) {
  const library = useLibrary();
  const update = useUpdateLibraryEntry();
  const entries = library.data ?? [];
  if (!entries.some((e) => e.igdbId === igdbId)) return null;

  function rate(rating: Rating) {
    for (const id of entriesToRate(entries, igdbId, rating)) {
      update.mutate({ id, patch: { rating } });
    }
  }

  return (
    <DetailSection title="Your rating">
      <RatingStars value={gameRating(entries, igdbId)} onChange={rate} label="Your rating" />
      {update.error ? <Notice tone="error">{update.error.message}</Notice> : null}
    </DetailSection>
  );
}
