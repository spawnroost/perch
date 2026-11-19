import { providerButtonLabel, steamStartPath, type SteamAuthMode } from '@perch/core/browser';
import { Button, ProviderMark } from '../atoms';

export interface SteamSignInButtonProps {
  mode?: SteamAuthMode;
}

/** A plain link: the whole Steam OpenID round trip is server redirects, no client JS. */
export function SteamSignInButton({ mode = 'login' }: SteamSignInButtonProps) {
  return (
    <Button asChild variant="secondary" className="w-full">
      <a href={steamStartPath(mode)}>
        <ProviderMark provider="steam" />
        {mode === 'onboard' ? 'Connect Steam' : providerButtonLabel('steam', mode)}
      </a>
    </Button>
  );
}
