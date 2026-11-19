import { useState } from 'react';
import type { PlayedBefore } from '@perch/core/browser';
import { Sheet, SheetContent } from '../atoms';
import { PlayedBeforePrompt } from './PlayedBeforePrompt';
import { playedBeforeHeading } from '@/lib/playedBefore';

/**
 * Opens by itself when an import hands back played-before games, once per result (`entries` is the
 * result's own array, so a new import opens it again).
 */
export function PlayedBeforeSheet({ entries }: { entries: readonly PlayedBefore[] }) {
  const [closed, setClosed] = useState<readonly PlayedBefore[] | null>(null);
  return (
    <Sheet open={entries.length > 0 && closed !== entries} onOpenChange={() => setClosed(entries)}>
      <SheetContent
        title={playedBeforeHeading(entries.length)}
        description="Paused or Backlog: you decide what to do with them."
      >
        <PlayedBeforePrompt entries={entries} onDone={() => setClosed(entries)} />
      </SheetContent>
    </Sheet>
  );
}
