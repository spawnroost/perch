import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import type { AppVars, RouteDeps } from './app.js';

export function requireAuth({ auth }: Pick<RouteDeps, 'auth'>) {
  return createMiddleware<AppVars>(async (c, next) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) throw new HTTPException(401, { message: 'authentication required' });
    c.set('user', session.user);
    await next();
  });
}
