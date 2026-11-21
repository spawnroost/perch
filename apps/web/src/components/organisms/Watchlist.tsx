import { Notice, Skeleton } from '../atoms';
import { WatchRow } from '../molecules';
import { useRemoveWatch, useWatches } from '@/hooks/queries';

/** The user's price watches with the current price against each target. */
export function Watchlist() {
  const { data, isPending, error } = useWatches();
  const remove = useRemoveWatch();
  if (isPending) return <Skeleton className="h-16 w-full" aria-busy />;
  if (error) return <Notice tone="error">Could not load your watchlist.</Notice>;
  if (data.watches.length === 0) {
    return (
      <p className="text-sm text-fg-subtle">
        Nothing watched yet. Open a game and choose Watch price.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-3">
      {data.watches.map((w) => (
        <WatchRow
          key={w.igdbId}
          watch={w}
          removing={remove.isPending && remove.variables === w.igdbId}
          onRemove={() => remove.mutate(w.igdbId)}
        />
      ))}
    </ul>
  );
}
