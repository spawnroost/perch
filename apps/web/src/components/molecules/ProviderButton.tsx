import { providerButtonLabel, steamStartPath, type AuthProviderId } from '@perch/core';
import { Button, ProviderMark } from '../atoms';
import { useAction } from '@/hooks/useAction';
import { appUrl, authClient, unwrapAuth } from '@/lib/auth-client';

export interface ProviderButtonProps {
  provider: AuthProviderId;
  mode?: 'login' | 'link';
  /** Where the provider sends the browser back after sign-in or linking. */
  returnPath?: string;
}

/**
 * One sign-in/link button. Steam is a plain link (server-side OpenID redirects); Google and
 * Discord call better-auth, which redirects the browser to the provider.
 */
export function ProviderButton({ provider, mode = 'login', returnPath }: ProviderButtonProps) {
  const label = providerButtonLabel(provider, mode);
  const { run, pending, error } = useAction(async () => {
    if (provider === 'steam') return;
    const failPath = mode === 'link' ? '/account' : '/login';
    const input = {
      provider,
      callbackURL: appUrl(returnPath ?? (mode === 'link' ? '/account' : '/')),
      errorCallbackURL: appUrl(failPath),
    };
    unwrapAuth(
      mode === 'link' ? await authClient.linkSocial(input) : await authClient.signIn.social(input),
    );
  });
  if (provider === 'steam') {
    return (
      <Button asChild variant="secondary" className="w-full">
        <a href={steamStartPath(mode)}>
          <ProviderMark provider={provider} />
          {label}
        </a>
      </Button>
    );
  }
  return (
    <>
      <Button variant="secondary" className="w-full" loading={pending} onClick={() => void run()}>
        <ProviderMark provider={provider} />
        {label}
      </Button>
      {error && (
        <p role="alert" className="text-xs text-fit-no">
          {error}
        </p>
      )}
    </>
  );
}
