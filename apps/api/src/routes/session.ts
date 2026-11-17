import { Hono } from 'hono';
import { sessionForUser, sessionQuerySchema, type SessionResponse } from '@perch/core';
import type { AppVars, RouteDeps } from '../app.js';
import { parseQuery } from '../http.js';
import { requireAuth, requireIgdb } from '../middleware.js';
import { recommendationDto } from '../serialize.js';

export function sessionRoutes(deps: RouteDeps) {
  const r = new Hono<AppVars>();
  r.use('*', requireAuth());

  r.get('/', async (c) => {
    const query = parseQuery(c, sessionQuerySchema);
    const { cache } = requireIgdb(deps);
    const recs = await sessionForUser({ ...deps, cache }, c.get('user').id, query);
    return c.json({
      recommendations: recs.map((r) => ({
        ...recommendationDto(r),
        sessionReason: r.sessionReason,
      })),
    } satisfies SessionResponse);
  });

  return r;
}
