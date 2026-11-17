import { Notice } from '../atoms';
import { SteamSignInButton } from '../molecules';
import { useSteamError } from '@/hooks/useSteamError';

/** "or" divider, Steam sign-in link, and any `?steamError=` message from the last attempt. */
export function SteamAuthOptions() {
  const error = useSteamError();
  return (
    <div className="flex flex-col gap-3">
      {error && <Notice tone="error">{error}</Notice>}
      <div className="flex items-center gap-3 text-xs text-fg-muted" aria-hidden>
        <span className="h-px flex-1 bg-line" />
        or
        <span className="h-px flex-1 bg-line" />
      </div>
      <SteamSignInButton mode="login" />
    </div>
  );
}
