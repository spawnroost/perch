import { steamStartPath, type SteamAuthMode } from '@perch/core';
import { Button } from '../atoms';

export interface SteamSignInButtonProps {
  mode?: SteamAuthMode;
  children?: string;
}

/** A plain link: the whole Steam OpenID round trip is server redirects, no client JS. */
export function SteamSignInButton({
  mode = 'login',
  children = 'Sign in with Steam',
}: SteamSignInButtonProps) {
  return (
    <Button asChild variant="secondary" className="w-full">
      <a href={steamStartPath(mode)}>{children}</a>
    </Button>
  );
}
