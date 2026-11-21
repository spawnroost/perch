import { Link } from 'react-router';
import type { Watch } from '@perch/core/browser';
import { Badge, Button, Cover } from '../atoms';
import { watchStatus } from '@/lib/watch';

export interface WatchRowProps {
  watch: Watch;
  removing: boolean;
  onRemove: () => void;
}

/** One watchlist entry: cover, name, current price against the target and a stop button. */
export function WatchRow({ watch, removing, onRemove }: WatchRowProps) {
  const status = watchStatus(watch);
  return (
    <li className="flex items-center gap-3">
      <Cover src={watch.coverUrlSmall} alt="" label={watch.name} className="w-10 shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <Link
          to={`/games/${watch.igdbId}`}
          className="truncate rounded-sm text-sm text-fg underline-offset-4 hover:underline"
        >
          {watch.name}
        </Link>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-subtle">
          <Badge tone={status.tone === 'neutral' ? 'neutral' : status.tone}>{status.label}</Badge>
          {status.detail}
        </span>
      </div>
      <Button
        size="sm"
        variant="ghost"
        loading={removing}
        onClick={onRemove}
        aria-label={`Stop watching ${watch.name}`}
      >
        Stop
      </Button>
    </li>
  );
}
