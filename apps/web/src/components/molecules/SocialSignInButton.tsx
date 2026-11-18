import { providerButtonLabel, type SocialProvider } from '@perch/core/browser';
import { Button, ProviderMark } from '../atoms';
import { useAction } from '@/hooks/useAction';
import { appUrl, authClient, unwrapAuth } from '@/lib/auth-client';

export interface SocialSignInButtonProps {
  provider: SocialProvider;
  mode?: 'login' | 'link';
}

/** Google / Discord: better-auth starts the OAuth flow and redirects the browser to the provider. */
export function SocialSignInButton({ provider, mode = 'login' }: SocialSignInButtonProps) {
  const { run, pending, error } = useAction(async () => {
    const input = {
      provider,
      callbackURL: appUrl(mode === 'link' ? '/account' : '/'),
      errorCallbackURL: appUrl(mode === 'link' ? '/account' : '/login'),
    };
    unwrapAuth(
      mode === 'link' ? await authClient.linkSocial(input) : await authClient.signIn.social(input),
    );
  });
  return (
    <>
      <Button variant="secondary" className="w-full" loading={pending} onClick={() => void run()}>
        <ProviderMark provider={provider} />
        {providerButtonLabel(provider, mode)}
      </Button>
      {error && (
        <p role="alert" className="text-xs text-fit-no">
          {error}
        </p>
      )}
    </>
  );
}
