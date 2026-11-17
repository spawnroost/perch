import { describe, expect, it } from 'vitest';
import {
  authProvidersFor,
  incompleteSocialProviders,
  socialProviderConfig,
  socialProviderLabel,
  socialProfileOverrides,
  hasUsableVerifiedEmail,
  socialErrorMessage,
  linkedSocialProviders,
  enabledProviderList,
  providerButtonLabel,
} from '../../src/social-auth/index.js';

describe('socialProviderConfig', () => {
  it('registers nothing when nothing is configured', () => {
    expect(socialProviderConfig({})).toEqual({});
  });
  it('registers only the complete pairs', () => {
    expect(socialProviderConfig({ GOOGLE_CLIENT_ID: 'gid', GOOGLE_CLIENT_SECRET: 'gsec' })).toEqual(
      { google: { clientId: 'gid', clientSecret: 'gsec' } },
    );
    expect(
      socialProviderConfig({ DISCORD_CLIENT_ID: 'did', DISCORD_CLIENT_SECRET: 'dsec' }),
    ).toEqual({ discord: { clientId: 'did', clientSecret: 'dsec' } });
  });
  it('skips a half-configured pair', () => {
    expect(socialProviderConfig({ GOOGLE_CLIENT_ID: 'gid', DISCORD_CLIENT_SECRET: 'x' })).toEqual(
      {},
    );
  });
  it('treats empty strings as unset', () => {
    expect(socialProviderConfig({ GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '' })).toEqual({});
  });
});

describe('incompleteSocialProviders', () => {
  it('names providers with only one half set', () => {
    expect(incompleteSocialProviders({ GOOGLE_CLIENT_ID: 'gid' })).toEqual(['google']);
    expect(
      incompleteSocialProviders({ DISCORD_CLIENT_SECRET: 's', GOOGLE_CLIENT_SECRET: 's' }),
    ).toEqual(['google', 'discord']);
  });
  it('is empty for both-or-neither', () => {
    expect(incompleteSocialProviders({})).toEqual([]);
    expect(incompleteSocialProviders({ GOOGLE_CLIENT_ID: 'a', GOOGLE_CLIENT_SECRET: 'b' })).toEqual(
      [],
    );
  });
});

describe('authProvidersFor', () => {
  it('always enables Steam and reflects configured social providers', () => {
    expect(authProvidersFor({})).toEqual({ google: false, discord: false, steam: true });
    expect(authProvidersFor({ DISCORD_CLIENT_ID: 'a', DISCORD_CLIENT_SECRET: 'b' })).toEqual({
      google: false,
      discord: true,
      steam: true,
    });
  });
});

describe('socialProfileOverrides', () => {
  it('leaves verified Discord and Google profiles alone', () => {
    expect(socialProfileOverrides({ email: 'a@b.dev', verified: true })).toEqual({});
    expect(socialProfileOverrides({ email: 'a@b.dev', email_verified: true })).toEqual({});
    expect(socialProfileOverrides({ email: 'a@b.dev', email_verified: 'true' })).toEqual({});
  });
  it('blanks the email when unverified so it can never auto-link or sign up', () => {
    for (const p of [
      { email: 'a@b.dev', verified: false },
      { email: 'a@b.dev' },
      { email: 'a@b.dev', email_verified: false },
    ]) {
      const o = socialProfileOverrides(p);
      expect(o).toHaveProperty('email', undefined);
      expect(o).toHaveProperty('emailVerified', false);
    }
  });
  it('blanks .invalid and missing emails even when "verified"', () => {
    expect(hasUsableVerifiedEmail({ email: 'x@steam.perch.invalid', verified: true })).toBe(false);
    expect(hasUsableVerifiedEmail({ email: null, verified: true })).toBe(false);
    expect(hasUsableVerifiedEmail({ email: '  ', verified: true })).toBe(false);
  });
});

describe('web helpers', () => {
  it('labels providers', () => {
    expect(socialProviderLabel('google')).toBe('Google');
    expect(socialProviderLabel('discord')).toBe('Discord');
  });
  it('explains social sign-in errors', () => {
    expect(socialErrorMessage(null)).toBeNull();
    expect(socialErrorMessage('email_not_found')).toMatch(/verified email/);
    expect(socialErrorMessage('whatever')).toBe('Sign-in failed. Try again.');
  });
  it('keeps only linked social providers', () => {
    expect(linkedSocialProviders(['credential', 'discord', 'github', 'google'])).toEqual([
      'google',
      'discord',
    ]);
  });
});

describe('provider buttons', () => {
  it('lists enabled providers in display order', () => {
    expect(enabledProviderList({ google: true, discord: false, steam: true })).toEqual([
      'google',
      'steam',
    ]);
    expect(enabledProviderList({ google: false, discord: false, steam: true })).toEqual(['steam']);
    expect(enabledProviderList({ google: true, discord: true, steam: true })).toEqual([
      'google',
      'discord',
      'steam',
    ]);
  });
  it('words the button by mode', () => {
    expect(providerButtonLabel('google', 'login')).toBe('Continue with Google');
    expect(providerButtonLabel('discord', 'link')).toBe('Link Discord');
    expect(providerButtonLabel('steam', 'login')).toBe('Sign in with Steam');
    expect(providerButtonLabel('steam', 'link')).toBe('Link Steam');
  });
});
