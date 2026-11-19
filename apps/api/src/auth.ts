import { eq } from 'drizzle-orm';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import {
  createVerifiedEmailStash,
  hasUsableVerifiedEmail,
  isSteamPlaceholderEmail,
  placeholderEmailUpgrade,
  socialAccountKey,
  socialProfileOverrides,
  socialProviderConfig,
  type RawSocialProfile,
  type SocialCredentials,
  type SocialProvider,
  type SocialProviderConfig,
} from '@perch/core';
import { schema, type Db } from '@perch/db';
import type { ApiEnv } from './env.js';
import { skipPlaceholderRecipients, type Mailer } from './mailer.js';

type VerifiedEmailStash = ReturnType<typeof createVerifiedEmailStash>;

/**
 * Registers only configured providers, each behind the email gate (no `.invalid`, no unverified).
 * Verified emails are stashed per account so linking can upgrade a Steam placeholder email.
 */
function gatedSocialProviders(config: SocialProviderConfig, stash: VerifiedEmailStash) {
  const gate = (id: SocialProvider, c: SocialCredentials) => ({
    ...c,
    mapProfileToUser: (profile: RawSocialProfile) => {
      const overrides = socialProfileOverrides(profile);
      const key = socialAccountKey(id, profile);
      if (key && hasUsableVerifiedEmail(profile)) stash.remember(key, String(profile.email));
      return overrides;
    },
  });
  return {
    ...(config.google && { google: gate('google', config.google) }),
    ...(config.discord && { discord: gate('discord', config.discord) }),
  };
}

export function createAuth(db: Db, env: ApiEnv, rawMailer: Mailer) {
  const verifiedEmails = createVerifiedEmailStash();
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
        /** Last Steam library import; written only by the sync code. */
        steamSyncedAt: { type: 'date', required: false, input: false },
        /** Linked Xbox account; set only by the Xbox link route, never from client input. */
        xboxXuid: { type: 'string', required: false, input: false },
        xboxGamertag: { type: 'string', required: false, input: false },
        xboxSyncedAt: { type: 'date', required: false, input: false },
      },
    },
    // Only providers with credentials are registered; the Account page and login buttons key off this.
    socialProviders: gatedSocialProviders(socialProviderConfig(env), verifiedEmails),
    account: {
      // Google and Discord are trusted: a sign-in whose verified email matches a verified Perch
      // account links to it instead of creating a duplicate. Trust skips better-auth's own
      // provider-verified check, so `socialProfileOverrides` blanks unverified emails first.
      // Linking only happens from a signed-in session, so a different provider email is fine
      // (Steam-only users have a `.invalid` one). Sign-in by email match is unaffected.
      accountLinking: {
        enabled: true,
        trustedProviders: ['google', 'discord'],
        allowDifferentEmails: true,
      },
    },
    databaseHooks: {
      account: {
        create: {
          // A Steam-only user linking Google/Discord adopts the verified provider email.
          after: async (account) => {
            if (account.providerId !== 'google' && account.providerId !== 'discord') return;
            const providerEmail = verifiedEmails.take(`${account.providerId}:${account.accountId}`);
            if (!providerEmail) return;
            const [user] = await db
              .select({ email: schema.users.email })
              .from(schema.users)
              .where(eq(schema.users.id, account.userId))
              .limit(1);
            if (!user) return;
            const [taken] = await db
              .select({ id: schema.users.id })
              .from(schema.users)
              .where(eq(schema.users.email, providerEmail.toLowerCase()))
              .limit(1);
            const next = placeholderEmailUpgrade(user.email, providerEmail, Boolean(taken));
            if (!next) return;
            try {
              await db
                .update(schema.users)
                .set({ email: next, emailVerified: true })
                .where(eq(schema.users.id, account.userId));
            } catch (err) {
              console.error(err); // lost a race for the address: keep the placeholder
            }
          },
        },
      },
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
