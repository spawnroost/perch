import { Hono } from 'hono';
import {
  recommendationsQuerySchema,
  recommendForUser,
  type RecommendationsResponse,
} from '@perch/core';
import type { AppVars, RouteDeps } from '../app.js';
import { parseQuery } from '../http.js';
import { requireAuth, requireIgdb } from '../middleware.js';
import { recommendationDto } from '../serialize.js';

export function recommendationsRoutes(deps: RouteDeps) {
  const r = new Hono<AppVars>();
  r.use('*', requireAuth());

  r.get('/', async (c) => {
    const { device, limit } = parseQuery(c, recommendationsQuerySchema);
    const { cache } = requireIgdb(deps);
    const recs = await recommendForUser({ ...deps, cache }, c.get('user').id, { device, limit });
    return c.json({
      recommendations: recs.map(recommendationDto),
    } satisfies RecommendationsResponse);
  });

  return r;
}
