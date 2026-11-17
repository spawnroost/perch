import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { schema, type Db } from '@perch/db';
import type { ApiEnv } from './env.js';
import { skipPlaceholderRecipients, type Mailer } from './mailer.js';

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
    user: { deleteUser: { enabled: true } },
  });
}

export type Auth = ReturnType<typeof createAuth>;
