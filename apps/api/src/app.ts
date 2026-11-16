import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import type { Db } from '@perch/db';
import { createAuth, type Auth } from './auth.js';
import type { ApiEnv } from './env.js';
import type { Mailer } from './mailer.js';
import { requireAuth } from './middleware.js';
import { DEFAULT_RATE_LIMITS, rateLimit, type RateLimitConfig } from './rate-limit.js';

export type { RateLimitConfig };

export interface AppDeps {
  db: Db;
  env: ApiEnv;
  mailer: Mailer;
  /** Overrides the default limits (tests). */
  rateLimit?: RateLimitConfig;
}

export type AuthUser = Auth['$Infer']['Session']['user'];

export interface AppVars {
  Variables: { user: AuthUser };
  Bindings: Record<string, never>;
}

export interface RouteDeps extends AppDeps {
  auth: Auth;
}

export function createApp({ db, env, mailer, rateLimit: limits }: AppDeps) {
  const auth = createAuth(db, env, mailer);
  const deps: RouteDeps = { db, env, mailer, auth };
  const app = new Hono<AppVars>();

  app.use('/api/*', cors({ origin: env.WEB_ORIGIN, credentials: true }));
  app.use(
    '/api/*',
    rateLimit(limits ?? DEFAULT_RATE_LIMITS, (headers) => auth.api.getSession({ headers })),
  );

  // Container healthcheck. No secrets, no row data.
  app.get('/api/health', (c) => c.json({ ok: true }));
  app.on(['GET', 'POST'], '/api/auth/*', (c) => auth.handler(c.req.raw));
  app.get('/api/me', requireAuth(deps), (c) => {
    const { id, email, name } = c.get('user');
    return c.json({ id, email, name });
  });

  app.notFound((c) => c.json({ error: 'not found' }, 404));
  app.onError((err, c) => {
    if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
    console.error(err);
    return c.json({ error: 'internal error' }, 500);
  });

  return app;
}

export type App = ReturnType<typeof createApp>;
