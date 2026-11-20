import { Notice, RatingStars } from '../atoms';
import { DetailSection } from '../molecules';
import { useGameRating } from '@/hooks/useGameRating';

/** Rail block to rate a game in the library; renders nothing when it is not there. */
export function GameRating({ igdbId }: { igdbId: number }) {
  const { inLibrary, rating, rate, pending, error } = useGameRating(igdbId);
  if (!inLibrary) return null;

  return (
    <DetailSection title="Your rating">
      <RatingStars value={rating} onChange={rate} disabled={pending} label="Your rating" />
      {error ? <Notice tone="error">{error.message}</Notice> : null}
    </DetailSection>
  );
}
