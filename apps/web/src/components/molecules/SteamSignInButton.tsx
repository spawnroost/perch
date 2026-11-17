import { providerButtonLabel, steamStartPath } from '@perch/core';
import { Button, ProviderMark } from '../atoms';

export interface SteamSignInButtonProps {
  mode?: 'login' | 'link';
}

/** A plain link: the whole Steam OpenID round trip is server redirects, no client JS. */
export function SteamSignInButton({ mode = 'login' }: SteamSignInButtonProps) {
  return (
    <Button asChild variant="secondary" className="w-full">
      <a href={steamStartPath(mode)}>
        <ProviderMark provider="steam" />
        {providerButtonLabel('steam', mode)}
      </a>
    </Button>
  );
}
