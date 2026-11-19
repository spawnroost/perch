import { useState } from 'react';
import type { PlayedBefore } from '@perch/core/browser';
import { Sheet, SheetContent } from '../atoms';
import { PlayedBeforePrompt } from './PlayedBeforePrompt';
import { usePlayedBefore } from '@/hooks/queries';
import { playedBeforeHeading } from '@/lib/playedBefore';

/**
 * Opens whenever imported games are waiting for the "played before" answer, whichever import put
 * them there (Steam auto-sync included). Closing it with X leaves them pending; it opens again when
 * the waiting list changes or on the next visit. Answering empties the list and closes it.
 */
export function PlayedBeforeSheet() {
  const entries = usePlayedBefore().data;
  const [closed, setClosed] = useState<readonly PlayedBefore[] | null>(null);
  if (!entries) return null;
  return (
    <Sheet open={entries.length > 0 && closed !== entries} onOpenChange={() => setClosed(entries)}>
      <SheetContent
        title={playedBeforeHeading(entries.length)}
        description="Paused or Backlog: you decide what to do with them."
      >
        <PlayedBeforePrompt entries={entries} />
      </SheetContent>
    </Sheet>
  );
}
