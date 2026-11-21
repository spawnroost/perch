import { useState } from 'react';
import { Bell, BellOff } from 'lucide-react';
import { Button } from '../atoms';
import { WatchForm } from '../molecules';
import { usePrices, useRemoveWatch, useSetWatch, useWatches } from '@/hooks/queries';
import { formatUsd } from '@/lib/prices';

/** Game detail control (for games with a PC price): watch the price (any sale, or at a target) and change or stop the watch. */
export function PriceWatch({ igdbId }: { igdbId: number }) {
  const watches = useWatches();
  const prices = usePrices(igdbId);
  const set = useSetWatch();
  const remove = useRemoveWatch();
  const [editing, setEditing] = useState(false);
  if (!watches.data) return null;
  const watch = watches.data.watches.find((w) => w.igdbId === igdbId);
  // Nothing to watch for a game no PC store sells (unless it is already on the list).
  if (!watch && !prices.data?.prices) return null;

  if (editing) {
    return (
      <WatchForm
        initialTarget={watch?.targetPrice ?? null}
        pending={set.isPending}
        error={set.error?.message}
        onCancel={() => setEditing(false)}
        onSave={(targetPrice) =>
          set.mutate({ igdbId, targetPrice }, { onSuccess: () => setEditing(false) })
        }
      />
    );
  }
  if (!watch) {
    return (
      <Button className="w-fit" onClick={() => setEditing(true)}>
        <Bell size={14} strokeWidth={1.75} aria-hidden />
        Watch price
      </Button>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm text-fg-muted">
      <Bell size={14} strokeWidth={1.75} aria-hidden />
      <span>
        Watching for{' '}
        {watch.targetPrice === null ? 'any sale' : `${formatUsd(watch.targetPrice)} or less`}
      </span>
      <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
        Change
      </Button>
      <Button
        size="sm"
        variant="ghost"
        loading={remove.isPending}
        onClick={() => remove.mutate(igdbId)}
      >
        <BellOff size={14} strokeWidth={1.75} aria-hidden />
        Stop
      </Button>
    </div>
  );
}
