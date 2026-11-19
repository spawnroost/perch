import { useState } from 'react';
import { Button, Notice, Sheet, SheetContent } from '../atoms';
import { SteamSignInButton } from '../molecules';
import { ExportImport } from './ExportImport';
import { PlayedBeforeSheet } from './PlayedBeforeSheet';
import { ImportList } from './ImportList';
import { SteamSync } from './SteamSync';
import { XboxSync } from './XboxSync';
import { useAccount, useLibrary, usePlayedBefore } from '@/hooks/queries';
import { useAuthError } from '@/hooks/useAuthError';
import { usePolling } from '@/hooks/usePolling';

const POLL_MS = 4000;
const POLL_TICKS = 15;

/**
 * Onboarding import options: connect or sync Steam, or paste a list.
 * Linking Steam starts a background sync, so an empty library is polled for a minute.
 */
export function BringYourGames() {
  const account = useAccount().data;
  const library = useLibrary();
  const authError = useAuthError();
  const [pasting, setPasting] = useState(false);
  const [fromFile, setFromFile] = useState(false);
  const linked = Boolean(account?.steamId);
  const steamOn = Boolean(account?.steamSyncAvailable);
  const waiting = linked && steamOn && !authError && (library.data?.length ?? 1) === 0;
  const { refetch } = library;
  const { refetch: refetchPlayedBefore } = usePlayedBefore();

  usePolling(
    waiting,
    () => {
      void refetch();
      void refetchPlayedBefore();
    },
    POLL_MS,
    POLL_TICKS,
  );

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-line bg-surface-1 p-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-fg">Bring your games</h2>
        <p className="text-sm text-fg-muted">
          Pull in what you own with playtime, or paste a list from anywhere.
        </p>
      </div>
      {authError && <Notice tone="error">{authError}</Notice>}
      <div className="flex flex-wrap items-start gap-3">
        {account && steamOn && linked && <SteamSync syncedAt={account.steamSyncedAt} />}
        {account && steamOn && !linked && (
          <div className="w-full sm:w-fit">
            <SteamSignInButton mode="onboard" />
          </div>
        )}
        <Button variant="secondary" className="w-full sm:w-fit" onClick={() => setPasting(true)}>
          Paste a list
        </Button>
        <Button variant="secondary" className="w-full sm:w-fit" onClick={() => setFromFile(true)}>
          Import Epic/GOG file
        </Button>
      </div>
      {account?.xboxSyncAvailable && (
        <div className="flex flex-col gap-2 border-t border-line pt-3">
          <h3 className="text-sm font-medium text-fg">Xbox</h3>
          <XboxSync gamertag={account.xboxGamertag} syncedAt={account.xboxSyncedAt} />
        </div>
      )}
      {waiting && <p className="text-sm text-fg-muted">Importing your Steam library…</p>}
      <p className="text-xs text-fg-subtle">PlayStation is coming.</p>
      <Sheet open={pasting} onOpenChange={setPasting}>
        <SheetContent
          title="Paste a list"
          description="One game per line. Hours, last played and status are optional, split by |."
        >
          <ImportList onDone={() => setPasting(false)} />
        </SheetContent>
      </Sheet>
      <Sheet open={fromFile} onOpenChange={setFromFile}>
        <SheetContent
          title="Import Epic/GOG file"
          description="Pick your Heroic or Playnite export files."
        >
          <ExportImport onDone={() => setFromFile(false)} />
        </SheetContent>
      </Sheet>
      <PlayedBeforeSheet suspended={pasting || fromFile} />
    </section>
  );
}
