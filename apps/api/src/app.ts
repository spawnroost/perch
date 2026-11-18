import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import {
  DeviceInputError,
  DeviceNotFoundError,
  GameNotFoundError,
  IgdbError,
  ImportTooLargeError,
  authProvidersFor,
  createAccentFetcher,
  createIgdbCache,
  type IgdbCache,
  type IgdbClient,
  type SteamClient,
} from '@perch/core';
import type { Db } from '@perch/db';
import { mapGame, VOCAB } from '@perch/taste-vocab';
import { createAuth, type Auth } from './auth.js';
import { createSteamSync, type SteamSync } from './steam-sync.js';
import type { ApiEnv } from './env.js';
import type { Mailer } from './mailer.js';
import { requireAuth, resolveSession } from './middleware.js';
import { devicesRoutes, hardwareRoutes } from './routes/devices.js';
import { feedbackRoutes, profileRoutes } from './routes/feedback.js';
import { gamesRoutes } from './routes/games.js';
import { libraryRoutes } from './routes/library.js';
import { recommendationsRoutes } from './routes/recommendations.js';
import { sessionRoutes } from './routes/session.js';
import { accountRoutes, steamAuthRoutes } from './routes/steam.js';
import type { SteamOpenIdVerifier } from './steam-openid.js';
import { DEFAULT_RATE_LIMITS, rateLimit, type RateLimitConfig } from './rate-limit.js';

export type { RateLimitConfig };

export interface AppDeps {
  db: Db;
  env: ApiEnv;
  mailer: Mailer;
  /** IGDB access (cached in the DB); routes that need it answer 503 when absent. */
  igdb?: IgdbClient;
  /** Cover image -> accent colour; defaults to downloading the cover (tests stub it). */
  accentFor?: (coverUrl: string) => Promise<string | null>;
  /** Overrides the Steam client (tests); the default talks to Steam. */
  steam?: SteamClient;
  /** Fetch used for Steam Web API calls (tests stub it); defaults to the global fetch. */
  steamFetch?: typeof fetch;
  /** Verifies Steam OpenID assertions; the default asks Steam (tests stub it). */
  steamOpenId?: SteamOpenIdVerifier;
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
  /** Steam library import, shared by the sync route and the auto-sync triggers. */
  steamSync: SteamSync;
  /** Taste-vocab id -> label, for reasons. */
  labels: Record<string, string>;
}

export function createApp(appDeps: AppDeps) {
  const { db, env, mailer, igdb, rateLimit: limits } = appDeps;
  const auth = createAuth(db, env, mailer);
  const base: Omit<RouteDeps, 'steamSync'> = {
    ...appDeps,
    auth,
    cache: igdb
      ? createIgdbCache({
          db,
          client: igdb,
          mapVocab: mapGame,
          accentFor: appDeps.accentFor ?? createAccentFetcher(),
        })
      : null,
    mapVocab: mapGame,
    labels: Object.fromEntries(VOCAB.map((v) => [v.id, v.label])),
  };
  const deps: RouteDeps = { ...base, steamSync: createSteamSync(base) };
  const app = new Hono<AppVars>();

  app.use('/api/*', cors({ origin: env.WEB_ORIGIN, credentials: true }));
  app.use('/api/*', resolveSession(deps));
  app.use('/api/*', rateLimit(limits ?? DEFAULT_RATE_LIMITS, { trustProxy: env.TRUST_PROXY }));

  // Container healthcheck. No secrets, no row data.
  app.get('/api/health', (c) => c.json({ ok: true }));
  // Which sign-in buttons the web should render. Public; booleans only, never credentials.
  app.get('/api/auth-providers', (c) => c.json(authProvidersFor(env)));
  // Before the catch-all: Steam sign-in is ours, not better-auth's.
  app.route('/api/auth/steam', steamAuthRoutes(deps));
  app.on(['GET', 'POST'], '/api/auth/*', (c) => auth.handler(c.req.raw));
  app.get('/api/me', requireAuth(), (c) => {
    const { id, email, name } = c.get('user');
    return c.json({ id, email, name });
  });

  app.route('/api/account', accountRoutes(deps));
  app.route('/api/games', gamesRoutes(deps));
  app.route('/api/library', libraryRoutes(deps));
  app.route('/api/devices', devicesRoutes(deps));
  app.route('/api/hardware', hardwareRoutes());
  app.route('/api/recommendations', recommendationsRoutes(deps));
  app.route('/api/session', sessionRoutes(deps));
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
