import { useState } from 'react';
import type { PlayedBefore } from '@perch/core/browser';
import { Button, Notice } from '../atoms';
import { useResolvePlayedBefore } from '@/hooks/queries';
import {
  playedBeforeDetail,
  playedBeforeHeading,
  selectedIds,
  toggleSelected,
  unselectedIds,
} from '@/lib/playedBefore';

/**
 * After an import: games that were played before but not lately came in as backlog. Ask whether
 * they are paused instead. All start checked; the unchecked ones stay in the backlog and are not
 * asked about again. Either answer empties the list, which closes the sheet.
 */
export function PlayedBeforePrompt({ entries }: { entries: readonly PlayedBefore[] }) {
  const [cleared, setCleared] = useState<ReadonlySet<string>>(new Set());
  const resolve = useResolvePlayedBefore();
  const ids = selectedIds(entries, cleared);
  const all = entries.map((e) => e.entryId);

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <p className="text-sm text-fg-muted">
        {playedBeforeHeading(entries.length)}, but not lately. Mark them as Paused, or leave them in
        your Backlog.
      </p>
      {resolve.error && <Notice tone="error">{resolve.error.message}</Notice>}
      <ul className="no-scrollbar overflow-y-auto rounded-lg border border-line bg-surface-1">
        {entries.map((e) => (
          <li key={e.entryId} className="border-b border-line last:border-b-0">
            <label className="flex cursor-pointer items-center gap-3 px-3 py-2">
              <input
                type="checkbox"
                className="size-4 accent-accent"
                checked={!cleared.has(e.entryId)}
                onChange={() => setCleared((prev) => toggleSelected(prev, e.entryId))}
              />
              <span className="min-w-0 flex-1 truncate text-sm text-fg">{e.title}</span>
              <span className="shrink-0 text-xs text-fg-muted tabular-nums">
                {playedBeforeDetail(e)}
              </span>
            </label>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Button
          variant="primary"
          disabled={ids.length === 0 || resolve.isPending}
          loading={resolve.isPending}
          onClick={() =>
            resolve.mutate({ pausedIds: ids, keptIds: unselectedIds(entries, cleared) })
          }
        >
          Mark as Paused{ids.length > 0 ? ` (${ids.length})` : ''}
        </Button>
        <Button
          variant="secondary"
          disabled={resolve.isPending}
          onClick={() => resolve.mutate({ pausedIds: [], keptIds: all })}
        >
          Keep in Backlog
        </Button>
      </div>
    </div>
  );
}
