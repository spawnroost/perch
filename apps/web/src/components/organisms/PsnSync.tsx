import { LinkedAccountSync } from './LinkedAccountSync';
import { useLinkPsn, useSyncPsn, useUnlinkPsn } from '@/hooks/queries';
import { psnErrorText } from '@/lib/psnSync';

/**
 * PlayStation import: an online ID form until linked, then sync / unlink with the last result.
 * The played-games list is public data, so it must be visible to Anyone.
 */
export function PsnSync({
  onlineId,
  syncedAt,
}: {
  onlineId: string | null;
  syncedAt: string | null;
}) {
  return (
    <LinkedAccountSync
      store="PlayStation"
      handleLabel="PlayStation online ID"
      handleName="onlineId"
      hint="Gaming history must be visible to Anyone in PlayStation privacy settings."
      handle={onlineId}
      syncedAt={syncedAt}
      link={useLinkPsn()}
      sync={useSyncPsn()}
      unlink={useUnlinkPsn()}
      errorText={psnErrorText}
    />
  );
}
