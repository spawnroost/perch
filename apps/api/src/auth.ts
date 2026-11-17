import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import {
  isSteamPlaceholderEmail,
  socialProfileOverrides,
  socialProviderConfig,
  type SocialCredentials,
  type SocialProviderConfig,
} from '@perch/core';
import { schema, type Db } from '@perch/db';
import type { ApiEnv } from './env.js';
import { skipPlaceholderRecipients, type Mailer } from './mailer.js';

/** Registers only configured providers, each behind the email gate (no `.invalid`, no unverified). */
function gatedSocialProviders(config: SocialProviderConfig) {
  const gate = (c: SocialCredentials) => ({ ...c, mapProfileToUser: socialProfileOverrides });
  return {
    ...(config.google && { google: gate(config.google) }),
    ...(config.discord && { discord: gate(config.discord) }),
  };
}

export function createAuth(db: Db, env: ApiEnv, rawMailer: Mailer) {
  const mailer = skipPlaceholderRecipients(rawMailer);
  return betterAuth({
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    trustedOrigins: [env.WEB_ORIGIN],
    // Tables are plural (users, sessions, accounts, verifications).
    database: drizzleAdapter(db, { provider: 'pg', schema, usePlural: true }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      sendResetPassword: async ({ user, url }) => {
        await mailer.send({
          to: user.email,
          subject: 'Reset your Perch password',
          text: `Reset your password:\n\n${url}\n\nIgnore this mail if you did not ask for it.`,
        });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        await mailer.send({
          to: user.email,
          subject: 'Verify your Perch email',
          text: `Confirm your email address:\n\n${url}`,
        });
      },
    },
    // Deleting a user cascades to library, devices, feedback, profiles and sessions (FKs).
    // Without a password in the body, better-auth requires a fresh session instead.
    user: {
      deleteUser: { enabled: true },
      additionalFields: {
        /** SteamID64; set only by our Steam OpenID flow, never from client input. */
        steamId: { type: 'string', required: false, input: false },
      },
    },
    // Only providers with credentials are registered; the Account page and login buttons key off this.
    socialProviders: gatedSocialProviders(socialProviderConfig(env)),
    account: {
      // Google and Discord are trusted: a sign-in whose verified email matches a verified Perch
      // account links to it instead of creating a duplicate. Trust skips better-auth's own
      // provider-verified check, so `socialProfileOverrides` blanks unverified emails first.
      accountLinking: { enabled: true, trustedProviders: ['google', 'discord'] },
    },
    hooks: {
      // `.invalid` addresses are reserved for Steam-only accounts: nobody may claim one.
      before: createAuthMiddleware(async (ctx) => {
        const body = ctx.body as { email?: unknown; newEmail?: unknown } | undefined;
        const email = ctx.path === '/sign-up/email' ? body?.email : body?.newEmail;
        if (
          (ctx.path === '/sign-up/email' || ctx.path === '/change-email') &&
          typeof email === 'string' &&
          isSteamPlaceholderEmail(email.trim())
        ) {
          throw new APIError('BAD_REQUEST', { message: 'That email address is not allowed.' });
        }
      }),
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
