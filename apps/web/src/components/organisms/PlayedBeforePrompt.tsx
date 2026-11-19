import { useState } from 'react';
import type { PlayedBefore } from '@perch/core/browser';
import { Button, Notice } from '../atoms';
import { useBulkSetStatus } from '@/hooks/queries';
import {
  playedBeforeDetail,
  playedBeforeHeading,
  selectedIds,
  toggleSelected,
} from '@/lib/playedBefore';

/**
 * After an import: games that were played before but not lately came in as backlog. Ask whether
 * they are paused instead. All start checked; "Keep in Backlog" changes nothing.
 */
export function PlayedBeforePrompt({
  entries,
  onDone,
}: {
  entries: readonly PlayedBefore[];
  onDone: () => void;
}) {
  const [cleared, setCleared] = useState<ReadonlySet<string>>(new Set());
  const save = useBulkSetStatus();
  const ids = selectedIds(entries, cleared);

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <p className="text-sm text-fg-muted">
        {playedBeforeHeading(entries.length)}, but not lately. Mark them as Paused, or leave them in
        your Backlog.
      </p>
      {save.error && <Notice tone="error">{save.error.message}</Notice>}
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
          disabled={ids.length === 0}
          loading={save.isPending}
          onClick={() => save.mutate({ ids, status: 'paused' }, { onSuccess: onDone })}
        >
          Mark as Paused{ids.length > 0 ? ` (${ids.length})` : ''}
        </Button>
        <Button variant="secondary" disabled={save.isPending} onClick={onDone}>
          Keep in Backlog
        </Button>
      </div>
    </div>
  );
}
