import { LinkedAccountSync } from './LinkedAccountSync';
import { useLinkXbox, useSyncXbox, useUnlinkXbox } from '@/hooks/queries';
import { xboxErrorText } from '@/lib/xboxSync';

/**
 * Xbox import: a gamertag form until linked, then sync / unlink with the last result.
 * The title history is read from Xbox Live, so the profile's game history must be public.
 */
export function XboxSync({
  gamertag,
  syncedAt,
}: {
  gamertag: string | null;
  syncedAt: string | null;
}) {
  return (
    <LinkedAccountSync
      store="Xbox"
      handleLabel="Xbox gamertag"
      handleName="gamertag"
      hint="Your Xbox game history must be public (Privacy & online safety)."
      handle={gamertag}
      syncedAt={syncedAt}
      link={useLinkXbox()}
      sync={useSyncXbox()}
      unlink={useUnlinkXbox()}
      errorText={xboxErrorText}
    />
  );
}
