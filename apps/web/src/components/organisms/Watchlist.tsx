import { Notice, Skeleton } from '../atoms';
import { CheckField, WatchRow } from '../molecules';
import { useRemoveWatch, useSetWatchEmails, useWatches } from '@/hooks/queries';

/** The user's price watches with the current price against each target, and the email switch. */
export function Watchlist() {
  const { data, isPending, error } = useWatches();
  const remove = useRemoveWatch();
  const emails = useSetWatchEmails();
  if (isPending) return <Skeleton className="h-16 w-full" aria-busy />;
  if (error) return <Notice tone="error">Could not load your watchlist.</Notice>;
  return (
    <div className="flex flex-col gap-4">
      <CheckField
        label="Email me when a watched game hits my price"
        hint="At most one email a day. Watches keep updating here when it is off."
        checked={emails.isPending ? !data.emails : data.emails}
        disabled={emails.isPending}
        onChange={(e) => emails.mutate(e.target.checked)}
      />
      {emails.error ? <Notice tone="error">{emails.error.message}</Notice> : null}
      {data.watches.length === 0 ? (
        <p className="text-sm text-fg-subtle">
          Nothing watched yet. Open a game and choose Watch price.
        </p>
      ) : (
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
      )}
    </div>
  );
}
