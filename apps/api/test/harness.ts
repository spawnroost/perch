import { eq } from 'drizzle-orm';
import { createDb, runMigrations, schema, type Db } from '@perch/db';
import { createApp, type AppDeps } from '../src/app.js';
import { parseEnv, type ApiEnv } from '../src/env.js';
import type { Mail, Mailer } from '../src/mailer.js';
import type { RateLimitConfig } from '../src/rate-limit.js';

export const testUrl = process.env.DATABASE_URL_TEST;

export const testEnv = parseEnv({
  BETTER_AUTH_SECRET: 'test-secret-test-secret-test-secret',
  BETTER_AUTH_URL: 'http://localhost:8787',
  WEB_ORIGIN: 'http://localhost:5173',
  NODE_ENV: 'test',
});

export function captureMailer(): Mailer & { sent: Mail[] } {
  const sent: Mail[] = [];
  return {
    sent,
    async send(mail) {
      sent.push(mail);
    },
  };
}

export async function setupApi(
  rateLimit?: RateLimitConfig,
  envOverrides: Partial<ApiEnv> = {},
  extra: Partial<
    Pick<
      AppDeps,
      | 'igdb'
      | 'steam'
      | 'soundtrack'
      | 'prices'
      | 'steamFetch'
      | 'xboxFetch'
      | 'xboxCooldownMs'
      | 'psnApi'
      | 'psnCooldownMs'
      | 'accentFor'
      | 'steamOpenId'
      | 'explainer'
      | 'voiceSummarizer'
      | 'reasonsWaitMs'
    >
  > = {},
) {
  await runMigrations(testUrl!);
  const db: Db = createDb(testUrl!);
  // The daily LLM counters must not carry over from earlier runs.
  await db.delete(schema.llmUsage);
  const mailer = captureMailer();
  const app = createApp({
    db,
    env: { ...testEnv, ...envOverrides },
    mailer,
    // Never download covers in tests.
    accentFor: async () => null,
    ...extra,
    ...(rateLimit ? { rateLimit } : {}),
  });
  const emails: string[] = [];
  return {
    db,
    app,
    mailer,
    newEmail() {
      const e = `api-${crypto.randomUUID()}@test.dev`;
      emails.push(e);
      return e;
    },
    async cleanup() {
      for (const e of emails) await db.delete(schema.users).where(eq(schema.users.email, e));
      await db.$client.end({ timeout: 1 });
    },
  };
}

export function json(body: unknown, headers: Record<string, string> = {}): RequestInit {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://localhost:5173', ...headers },
    body: JSON.stringify(body),
  };
}

/** Pulls the first http(s) URL out of a captured mail body. */
export function linkIn(mail: Mail): string {
  const m = /https?:\/\/\S+/.exec(mail.text);
  if (!m) throw new Error('no link in mail');
  return m[0];
}

/** Turns Set-Cookie headers into a Cookie request header. */
export function cookieFrom(res: Response): string {
  return res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
}
