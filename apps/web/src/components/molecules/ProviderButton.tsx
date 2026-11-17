import type { AuthProviderId } from '@perch/core';
import { SocialSignInButton } from './SocialSignInButton';
import { SteamSignInButton } from './SteamSignInButton';

export interface ProviderButtonProps {
  provider: AuthProviderId;
  mode?: 'login' | 'link';
}

/** Picks the right button for a provider: Steam is a link, the others call better-auth. */
export function ProviderButton({ provider, mode = 'login' }: ProviderButtonProps) {
  return provider === 'steam' ? (
    <SteamSignInButton mode={mode} />
  ) : (
    <SocialSignInButton provider={provider} mode={mode} />
  );
}
