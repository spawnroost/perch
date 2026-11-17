import { enabledProviderList } from '@perch/core';
import { Notice } from '../atoms';
import { ProviderButton } from '../molecules';
import { useAuthError } from '@/hooks/useAuthError';
import { useAuthProviders } from '@/hooks/queries';

/** "or" divider, a button per enabled provider, and any error from the last attempt. */
export function ProviderAuthOptions() {
  const error = useAuthError();
  const { providers, failed } = useAuthProviders();
  return (
    <div className="flex flex-col gap-3">
      {error && <Notice tone="error">{error}</Notice>}
      <div className="flex items-center gap-3 text-xs text-fg-muted" aria-hidden>
        <span className="h-px flex-1 bg-line" />
        or
        <span className="h-px flex-1 bg-line" />
      </div>
      {enabledProviderList(providers).map((p) => (
        <ProviderButton key={p} provider={p} mode="login" />
      ))}
      {failed && <p className="text-xs text-fg-muted">Couldn&apos;t load other sign-in options.</p>}
    </div>
  );
}
