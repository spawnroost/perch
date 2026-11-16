import { z } from 'zod';

export const ApiEnvSchema = z.object({
  BETTER_AUTH_SECRET: z.string().min(16),
  BETTER_AUTH_URL: z.url(),
  WEB_ORIGIN: z.url(),
  /** Set to send real mail through Resend; unset logs the links to the console. */
  RESEND_API_KEY: z.string().optional(),
  MAIL_FROM: z.string().default('Perch <noreply@perch.spawnroost.com>'),
  /** `1` when behind a reverse proxy (Caddy) that appends the real client IP to X-Forwarded-For. */
  TRUST_PROXY: z
    .enum(['0', '1'])
    .default('0')
    .transform((v) => v === '1'),
  NODE_ENV: z.string().optional(),
});
export type ApiEnv = z.infer<typeof ApiEnvSchema>;

/** Extra settings only the server entrypoint needs. */
export const ServerEnvSchema = ApiEnvSchema.extend({
  DATABASE_URL: z.string().min(1),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(8787),
});
export type ServerEnv = z.infer<typeof ServerEnvSchema>;

/** Drops unset and empty values so schema defaults and optionals apply. */
function clean(raw: Record<string, string | undefined>) {
  return Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== undefined && v !== ''));
}

/** Validates process.env-like input; empty strings count as unset. */
export function parseEnv(raw: Record<string, string | undefined>): ApiEnv {
  return ApiEnvSchema.parse(clean(raw));
}

export function parseServerEnv(raw: Record<string, string | undefined>): ServerEnv {
  return ServerEnvSchema.parse(clean(raw));
}
