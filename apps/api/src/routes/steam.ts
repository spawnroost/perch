import { eq } from 'drizzle-orm';
import { Hono, type Context } from 'hono';
import { deleteCookie, getSignedCookie, setSignedCookie } from 'hono/cookie';
import { getConnInfo } from '@hono/node-server/conninfo';
import { HTTPException } from 'hono/http-exception';
import {
  SteamAuthModeSchema,
  buildSteamLoginUrl,
  canUnlinkSteam,
  linkedSocialProviders,
  parseSteamCallback,
  socialProviderConfig,
  steamPlaceholderEmail,
  steamReturnPath,
  type SteamAuthMode,
  type SteamErrorCode,
} from '@perch/core';
import { schema } from '@perch/db';
import type { AppVars, RouteDeps } from '../app.js';
import { requireAuth } from '../middleware.js';
import { createSteamOpenIdVerifier } from '../steam-openid.js';

const STATE_COOKIE = 'perch_steam_state';
const STATE_TTL_SEC = 10 * 60;

/** `/api/auth/steam/*`: custom Steam OpenID 2.0 flow (better-auth has no Steam provider). */
function requestIp(c: Context, trustProxy: boolean): string {
  const hop = trustProxy ? c.req.header('x-forwarded-for')?.split(',').at(-1)?.trim() : undefined;
  if (hop) return hop;
  try {
    return getConnInfo(c).remote.address ?? '';
  } catch {
    return '';
  }
}

export function steamAuthRoutes(deps: RouteDeps) {
  const { db, env, auth } = deps;
  const verifier = deps.steamOpenId ?? createSteamOpenIdVerifier();
  const r = new Hono<AppVars>();
  const apiBase = env.BETTER_AUTH_URL.replace(/\/$/, '');
  const secure = apiBase.startsWith('https:');
  const stateCookie = secure ? `__Secure-${STATE_COOKIE}` : STATE_COOKIE;
  const returnToFor = (nonce: string) =>
    `${apiBase}/api/auth/steam/callback?${new URLSearchParams({ state: nonce }).toString()}`;
  const webRedirect = (c: Context, path: string, error?: SteamErrorCode) => {
    const url = new URL(path, env.WEB_ORIGIN);
    if (error) url.searchParams.set('steamError', error);
    return c.redirect(url.toString(), 302);
  };

  r.get('/start', async (c) => {
    const parsed = SteamAuthModeSchema.safeParse(c.req.query('mode') ?? 'login');
    if (!parsed.success) throw new HTTPException(400, { message: 'invalid mode' });
    const mode: SteamAuthMode = parsed.data;
    if (mode !== 'login' && !c.get('sessionUser')) return webRedirect(c, '/login', 'auth');
    const nonce = crypto.randomUUID();
    await setSignedCookie(c, stateCookie, `${mode}:${nonce}`, env.BETTER_AUTH_SECRET, {
      httpOnly: true,
      secure,
      sameSite: 'Lax',
      path: '/api/auth/steam',
      maxAge: STATE_TTL_SEC,
    });
    return c.redirect(buildSteamLoginUrl({ returnTo: returnToFor(nonce), realm: apiBase }), 302);
  });

  r.get('/callback', async (c) => {
    // The state cookie is single use: drop it whatever happens next.
    const cookie = await getSignedCookie(c, env.BETTER_AUTH_SECRET, stateCookie);
    deleteCookie(c, stateCookie, { path: '/api/auth/steam', secure });
    const [mode, nonce] = (typeof cookie === 'string' ? cookie : '').split(':');
    const modeOk = SteamAuthModeSchema.safeParse(mode);
    const query = c.req.query();
    if (!modeOk.success || !nonce || query.state !== nonce) {
      return webRedirect(c, steamReturnPath(mode), 'state');
    }
    const failPath = steamReturnPath(modeOk.data);

    if (query['openid.mode'] === 'cancel') return webRedirect(c, failPath, 'cancelled');
    const parsed = parseSteamCallback(query, returnToFor(nonce));
    if (!parsed.ok) return webRedirect(c, failPath, 'invalid');
    let valid = false;
    try {
      valid = await verifier.verify(query);
    } catch (err) {
      console.error(err);
    }
    if (!valid) return webRedirect(c, failPath, 'invalid');
    const { steamId } = parsed;

    const [owner] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.steamId, steamId))
      .limit(1);

    if (modeOk.data !== 'login') {
      const me = c.get('sessionUser');
      if (!me) return webRedirect(c, '/login', 'auth');
      if (owner && owner.id !== me.id) return webRedirect(c, failPath, 'conflict');
      await db.update(schema.users).set({ steamId }).where(eq(schema.users.id, me.id));
      deps.steamSync.maybeAuto(me.id, steamId);
      return webRedirect(c, failPath);
    }

    let userId = owner?.id;
    if (!userId) {
      userId = await createSteamUser(steamId);
    }
    await startSession(c, userId);
    deps.steamSync.maybeAuto(userId, steamId);
    return webRedirect(c, '/');
  });

  /** Creates the user with steamId in the same write; on a concurrent first login, reuses the winner. */
  async function createSteamUser(steamId: string): Promise<string> {
    const ctx = await auth.$context;
    try {
      const created = await ctx.internalAdapter.createUser(
        {
          email: steamPlaceholderEmail(steamId),
          emailVerified: true,
          name: 'Steam user',
          steamId,
        },
        { method: 'steam-openid' },
      );
      return created.id;
    } catch (err) {
      const [existing] = await db
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.steamId, steamId))
        .limit(1);
      if (existing) return existing.id;
      throw err;
    }
  }

  /** Creates a session and sets the cookie the way better-auth's setSessionCookie does. */
  async function startSession(c: Context, userId: string) {
    const ctx = await auth.$context;
    const session = await ctx.internalAdapter.createSession(userId, false, {
      ipAddress: requestIp(c, env.TRUST_PROXY),
      userAgent: c.req.header('user-agent') ?? '',
    });
    const { name, attributes } = ctx.authCookies.sessionToken;
    await setSignedCookie(c, name, session.token, ctx.secret, {
      ...attributes,
      maxAge: ctx.sessionConfig.expiresIn,
    } as Parameters<typeof setSignedCookie>[4]);
  }

  return r;
}

/** `/api/account`: the signed-in user's account state and Steam link management. */
export function accountRoutes({ db, env, steamSync }: RouteDeps) {
  const enabled = new Set<string>(Object.keys(socialProviderConfig(env)));
  const r = new Hono<AppVars>();
  r.use('*', requireAuth());

  /** Password and enabled social logins in one query. */
  async function signInMethods(userId: string) {
    const rows = await db
      .select({ providerId: schema.accounts.providerId, password: schema.accounts.password })
      .from(schema.accounts)
      .where(eq(schema.accounts.userId, userId));
    return {
      hasPassword: rows.some((r) => r.providerId === 'credential' && r.password !== null),
      linkedProviders: linkedSocialProviders(rows.map((r) => r.providerId)).filter((p) =>
        enabled.has(p),
      ),
    };
  }

  r.get('/', async (c) => {
    const { id, email, steamId } = c.get('user');
    const { steamSyncedAt } = c.get('user');
    // Off the request path: not awaited, never throws.
    if (steamId) steamSync.maybeAuto(id, steamId);
    return c.json({
      email,
      steamId: steamId ?? null,
      steamSyncedAt: steamSyncedAt ? new Date(steamSyncedAt).toISOString() : null,
      steamSyncAvailable: steamSync.configured,
      ...(await signInMethods(id)),
    });
  });

  r.post('/steam/unlink', async (c) => {
    const { id, steamId } = c.get('user');
    if (!canUnlinkSteam({ steamId: steamId ?? null, ...(await signInMethods(id)) }))
      return c.json({ error: 'Steam is your only sign-in method.' }, 409);
    await db
      .update(schema.users)
      .set({ steamId: null, steamSyncedAt: null })
      .where(eq(schema.users.id, id));
    return c.json({ ok: true });
  });

  return r;
}
