import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import {
  DeviceInputError,
  DeviceNotFoundError,
  GameNotFoundError,
  IgdbError,
  ImportTooLargeError,
  createIgdbCache,
  type IgdbCache,
  type IgdbClient,
  type SteamClient,
} from '@perch/core';
import type { Db } from '@perch/db';
import { mapGame, VOCAB } from '@perch/taste-vocab';
import { createAuth, type Auth } from './auth.js';
import type { ApiEnv } from './env.js';
import type { Mailer } from './mailer.js';
import { requireAuth, resolveSession } from './middleware.js';
import { devicesRoutes, hardwareRoutes } from './routes/devices.js';
import { feedbackRoutes, profileRoutes } from './routes/feedback.js';
import { gamesRoutes } from './routes/games.js';
import { libraryRoutes } from './routes/library.js';
import { recommendationsRoutes } from './routes/recommendations.js';
import { DEFAULT_RATE_LIMITS, rateLimit, type RateLimitConfig } from './rate-limit.js';

export type { RateLimitConfig };

export interface AppDeps {
  db: Db;
  env: ApiEnv;
  mailer: Mailer;
  /** IGDB access (cached in the DB); routes that need it answer 503 when absent. */
  igdb?: IgdbClient;
  /** Overrides the Steam client (tests); the default talks to Steam. */
  steam?: SteamClient;
  /** Overrides the default limits (tests). */
  rateLimit?: RateLimitConfig;
}

export type AuthUser = Auth['$Infer']['Session']['user'];

export interface AppVars {
  Variables: {
    /** Set by `resolveSession` on every request; null when anonymous. */
    sessionUser: AuthUser | null;
    /** Set by `requireAuth`. */
    user: AuthUser;
  };
  Bindings: Record<string, never>;
}

export interface RouteDeps extends AppDeps {
  auth: Auth;
  /** Null when no IGDB client is configured. */
  cache: IgdbCache | null;
  mapVocab: typeof mapGame;
  /** Taste-vocab id -> label, for reasons. */
  labels: Record<string, string>;
}

export function createApp(appDeps: AppDeps) {
  const { db, env, mailer, igdb, rateLimit: limits } = appDeps;
  const auth = createAuth(db, env, mailer);
  const deps: RouteDeps = {
    ...appDeps,
    auth,
    cache: igdb ? createIgdbCache({ db, client: igdb, mapVocab: mapGame }) : null,
    mapVocab: mapGame,
    labels: Object.fromEntries(VOCAB.map((v) => [v.id, v.label])),
  };
  const app = new Hono<AppVars>();

  app.use('/api/*', cors({ origin: env.WEB_ORIGIN, credentials: true }));
  app.use('/api/*', resolveSession(deps));
  app.use('/api/*', rateLimit(limits ?? DEFAULT_RATE_LIMITS, { trustProxy: env.TRUST_PROXY }));

  // Container healthcheck. No secrets, no row data.
  app.get('/api/health', (c) => c.json({ ok: true }));
  app.on(['GET', 'POST'], '/api/auth/*', (c) => auth.handler(c.req.raw));
  app.get('/api/me', requireAuth(), (c) => {
    const { id, email, name } = c.get('user');
    return c.json({ id, email, name });
  });

  app.route('/api/games', gamesRoutes(deps));
  app.route('/api/library', libraryRoutes(deps));
  app.route('/api/devices', devicesRoutes(deps));
  app.route('/api/hardware', hardwareRoutes());
  app.route('/api/recommendations', recommendationsRoutes(deps));
  app.route('/api/feedback', feedbackRoutes(deps));
  app.route('/api/profile', profileRoutes(deps));

  app.notFound((c) => c.json({ error: 'not found' }, 404));
  app.onError((err, c) => {
    if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
    if (err instanceof GameNotFoundError || err instanceof DeviceNotFoundError)
      return c.json({ error: err.message }, 404);
    if (err instanceof DeviceInputError || err instanceof ImportTooLargeError)
      return c.json({ error: err.message }, 400);
    if (err instanceof IgdbError) {
      console.error(err);
      return c.json({ error: 'game database unavailable' }, 502);
    }
    console.error(err);
    return c.json({ error: 'internal error' }, 500);
  });

  return app;
}

export type App = ReturnType<typeof createApp>;
