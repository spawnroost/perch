import { useEffect, useState } from 'react';
import { Button, Notice, Sheet, SheetContent } from '../atoms';
import { SteamSignInButton } from '../molecules';
import { ImportList } from './ImportList';
import { SteamSync } from './SteamSync';
import { useAccount, useLibrary } from '@/hooks/queries';
import { useAuthError } from '@/hooks/useAuthError';

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
  const linked = Boolean(account?.steamId);
  const steamOn = Boolean(account?.steamSyncAvailable);
  const waiting = linked && steamOn && !authError && (library.data?.length ?? 1) === 0;
  const { refetch } = library;

  useEffect(() => {
    if (!waiting) return;
    let ticks = 0;
    const id = setInterval(() => {
      ticks += 1;
      void refetch();
      if (ticks >= POLL_TICKS) clearInterval(id);
    }, POLL_MS);
    return () => clearInterval(id);
  }, [waiting, refetch]);

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
      </div>
      {waiting && <p className="text-sm text-fg-muted">Importing your Steam library…</p>}
      <p className="text-xs text-fg-subtle">Epic, GOG, Xbox and PlayStation are coming.</p>
      <Sheet open={pasting} onOpenChange={setPasting}>
        <SheetContent
          title="Paste a list"
          description="One game per line. Hours, last played and status are optional, split by |."
        >
          <ImportList onDone={() => setPasting(false)} />
        </SheetContent>
      </Sheet>
    </section>
  );
}
