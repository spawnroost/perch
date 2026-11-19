import { Button, Notice } from '../atoms';
import { useSyncSteamLibrary } from '@/hooks/queries';
import { steamSyncErrorText, steamSyncSummary, syncedAgo } from '@/lib/steamSync';

/** Sync button for a linked Steam account, with the last sync time and the result. */
export function SteamSync({ syncedAt }: { syncedAt: string | null }) {
  const sync = useSyncSteamLibrary();
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="primary"
          className="w-fit"
          loading={sync.isPending}
          onClick={() => sync.mutate()}
        >
          Sync Steam library
        </Button>
        <span className="text-sm text-fg-muted">{syncedAgo(syncedAt, new Date())}</span>
      </div>
      {sync.data && <Notice tone="success">{steamSyncSummary(sync.data)}</Notice>}
      {sync.error && <Notice tone="error">{steamSyncErrorText(sync.error)}</Notice>}
    </div>
  );
}
