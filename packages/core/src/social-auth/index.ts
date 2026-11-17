import { z } from 'zod';
import { isSteamPlaceholderEmail } from '../steam-auth/index.js';

/** Sign-in providers better-auth handles for us (Steam is our own OpenID flow). */
export const SOCIAL_PROVIDERS = ['google', 'discord'] as const;
export type SocialProvider = (typeof SOCIAL_PROVIDERS)[number];

export const SocialProviderSchema = z.enum(SOCIAL_PROVIDERS);

const LABELS: Record<SocialProvider, string> = { google: 'Google', discord: 'Discord' };

export function socialProviderLabel(provider: SocialProvider): string {
  return LABELS[provider];
}

export interface SocialCredentials {
  clientId: string;
  clientSecret: string;
}
export type SocialProviderConfig = Partial<Record<SocialProvider, SocialCredentials>>;
export interface SocialEnv {
  GOOGLE_CLIENT_ID?: string | undefined;
  GOOGLE_CLIENT_SECRET?: string | undefined;
  DISCORD_CLIENT_ID?: string | undefined;
  DISCORD_CLIENT_SECRET?: string | undefined;
}

const prefix = (p: SocialProvider) => p.toUpperCase() as Uppercase<SocialProvider>;

function readPair(env: SocialEnv, p: SocialProvider): [string | undefined, string | undefined] {
  return [
    env[`${prefix(p)}_CLIENT_ID`] || undefined,
    env[`${prefix(p)}_CLIENT_SECRET`] || undefined,
  ];
}

/** `socialProviders` input for better-auth: only providers with both id and secret. */
export function socialProviderConfig(env: SocialEnv): SocialProviderConfig {
  const out: SocialProviderConfig = {};
  for (const p of SOCIAL_PROVIDERS) {
    const [clientId, clientSecret] = readPair(env, p);
    if (clientId && clientSecret) out[p] = { clientId, clientSecret };
  }
  return out;
}

/** Providers with exactly one of id/secret set: a misconfiguration to fail fast on. */
export function incompleteSocialProviders(env: SocialEnv): SocialProvider[] {
  return SOCIAL_PROVIDERS.filter((p) => {
    const [clientId, clientSecret] = readPair(env, p);
    return Boolean(clientId) !== Boolean(clientSecret);
  });
}

/** What `GET /api/auth-providers` returns: which sign-in methods are enabled. */
export const AuthProvidersSchema = z.object({
  google: z.boolean(),
  discord: z.boolean(),
  steam: z.boolean(),
});
export type AuthProviders = z.infer<typeof AuthProvidersSchema>;

export function authProvidersFor(env: SocialEnv): AuthProviders {
  const cfg = socialProviderConfig(env);
  return { google: Boolean(cfg.google), discord: Boolean(cfg.discord), steam: true };
}

/** Fields of a raw Google (id token) or Discord (`/users/@me`) profile that we gate on. */
export interface RawSocialProfile {
  email?: unknown;
  /** Discord */
  verified?: unknown;
  /** Google */
  email_verified?: unknown;
  /** Discord account id */
  id?: unknown;
  /** Google account id */
  sub?: unknown;
}

const isTrue = (v: unknown) => v === true || v === 'true';

/** True when the profile carries a verified, mailable (not `.invalid`) email. */
export function hasUsableVerifiedEmail(profile: RawSocialProfile): boolean {
  return (
    typeof profile.email === 'string' &&
    profile.email.trim() !== '' &&
    !isSteamPlaceholderEmail(profile.email.trim()) &&
    (isTrue(profile.verified) || isTrue(profile.email_verified))
  );
}

/**
 * `mapProfileToUser` for Google and Discord. Unusable emails (missing, `.invalid` which is
 * reserved for Steam-only accounts, or unverified) are blanked, so better-auth refuses the sign-in
 * with `email_not_found` before it can create a user or link to an existing account by email.
 * Trusted-provider linking would otherwise let an unverified Discord address take over the
 * Perch account that owns it.
 */
export function socialProfileOverrides(
  profile: RawSocialProfile,
): { email: undefined; emailVerified: false } | Record<string, never> {
  return hasUsableVerifiedEmail(profile) ? {} : { email: undefined, emailVerified: false };
}

/** Social providers among an account's provider ids, in display order. */
export function linkedSocialProviders(providerIds: readonly string[]): SocialProvider[] {
  return SOCIAL_PROVIDERS.filter((p) => providerIds.includes(p));
}

const SOCIAL_ERRORS: Record<string, string> = {
  email_not_found:
    'That provider did not share a verified email address. Verify it there, then try again.',
  account_not_linked:
    'An account with that email already exists. Verify your email, or sign in with your password and link the provider from Account.',
  email_does_not_match: 'That provider email does not match your Perch email.',
  "email_doesn't_match": 'That provider email does not match your Perch email.',
  unable_to_link_account: 'Could not link that account. Try again.',
  account_already_linked_to_different_user:
    'That account is already linked to another Perch account.',
  access_denied: 'Sign-in was cancelled.',
};

/**
 * Readable text for better-auth's `?error=<code>` redirect. Known codes get a specific message;
 * other short, plain codes a generic one that names the code; anything else nothing.
 */
export function socialErrorMessage(code: string | null | undefined): string | null {
  if (!code) return null;
  const known = SOCIAL_ERRORS[code];
  if (known) return known;
  return /^[a-z0-9_]{1,40}$/i.test(code) ? `Sign-in failed (${code}). Try again.` : null;
}

/** `provider:accountId` for the account a raw profile belongs to, or null without an id. */
export function socialAccountKey(
  provider: SocialProvider,
  profile: RawSocialProfile,
): string | null {
  const id = provider === 'google' ? profile.sub : profile.id;
  return typeof id === 'string' || typeof id === 'number' ? `${provider}:${id}` : null;
}

/**
 * Short-lived memory of the verified email behind a social profile, so the account-created hook
 * (which only sees the account row) can learn which email the provider vouched for.
 */
export function createVerifiedEmailStash(ttlMs = 5 * 60_000, now: () => number = Date.now) {
  const entries = new Map<string, { email: string; at: number }>();
  return {
    remember(key: string, email: string) {
      for (const [k, v] of entries) if (now() - v.at > ttlMs) entries.delete(k);
      entries.set(key, { email, at: now() });
    },
    take(key: string): string | undefined {
      const hit = entries.get(key);
      entries.delete(key);
      return hit && now() - hit.at <= ttlMs ? hit.email : undefined;
    },
  };
}

/**
 * Steam-only users have an unmailable `.invalid` email. When they link a provider that vouches
 * for a real address nobody else uses, that address replaces it. Returns the new email or null.
 */
export function placeholderEmailUpgrade(
  currentEmail: string,
  providerEmail: string | undefined,
  emailTaken: boolean,
): string | null {
  if (!isSteamPlaceholderEmail(currentEmail) || !providerEmail || emailTaken) return null;
  const next = providerEmail.trim().toLowerCase();
  return next && !isSteamPlaceholderEmail(next) ? next : null;
}

export type AuthProviderId = SocialProvider | 'steam';

/** Enabled sign-in providers in button order. */
export function enabledProviderList(providers: AuthProviders): AuthProviderId[] {
  return (['google', 'discord', 'steam'] as const).filter((p) => providers[p]);
}

/** Button text: "Continue with X" to sign in, "Link X" from the Account page. */
export function providerButtonLabel(provider: AuthProviderId, mode: 'login' | 'link'): string {
  const name = provider === 'steam' ? 'Steam' : socialProviderLabel(provider);
  if (mode === 'link') return `Link ${name}`;
  return provider === 'steam' ? 'Sign in with Steam' : `Continue with ${name}`;
}
