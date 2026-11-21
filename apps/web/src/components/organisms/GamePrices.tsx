import { PriceTile } from '../molecules';
import { Skeleton } from '../atoms';
import { usePrices } from '@/hooks/queries';
import { priceSummary } from '@/lib/prices';

/** "Best price now" and "Historic low" tiles for the Where to buy block; nothing when no PC store sells it. */
export function GamePrices({ igdbId }: { igdbId: number }) {
  const { data, waiting } = usePrices(igdbId);
  if (waiting) return <Skeleton className="h-20 w-full" aria-busy />;
  const { best, low } = priceSummary(data?.prices);
  if (!best && !low) return null;
  return (
    <div className="grid grid-cols-2 gap-2">
      {best ? (
        <PriceTile
          label="Best price now"
          price={best.price}
          was={best.was}
          discount={best.discount}
          caption={best.store}
          href={best.url}
        />
      ) : null}
      {low ? (
        <PriceTile
          label="Historic low"
          price={low.price}
          caption={low.matched ? 'Matching it now' : (low.when ?? 'Date unknown')}
        />
      ) : null}
    </div>
  );
}
