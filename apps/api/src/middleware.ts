import { getSessionCookie } from 'better-auth/cookies';
import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import type { AppVars, RouteDeps } from './app.js';
import { isAuthPost } from './http.js';

/**
 * Resolves the session once per request and stores the user on the context (`sessionUser`).
 * Requests without a cookie better-auth recognises, and credential POSTs to /api/auth/* (keyed by
 * IP, the auth handler does its own work), cost no DB lookup.
 */
export function resolveSession({ auth }: Pick<RouteDeps, 'auth'>) {
  return createMiddleware<AppVars>(async (c, next) => {
    const skip = isAuthPost(c);
    let user = null;
    if (!skip && getSessionCookie(c.req.raw.headers)) {
      user = (await auth.api.getSession({ headers: c.req.raw.headers }))?.user ?? null;
    }
    c.set('sessionUser', user);
    await next();
  });
}

export function requireAuth() {
  return createMiddleware<AppVars>(async (c, next) => {
    const user = c.get('sessionUser');
    if (!user) throw new HTTPException(401, { message: 'authentication required' });
    c.set('user', user);
    await next();
  });
}
