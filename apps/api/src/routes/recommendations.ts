import { Hono } from 'hono';
import {
  recommendationCacheKey,
  recommendationsQuerySchema,
  recommendForUser,
  type RecommendationsResponse,
} from '@perch/core';
import type { AppVars, RouteDeps } from '../app.js';
import { parseQuery } from '../http.js';
import { cachedRecommendations } from '../recommendation-cache.js';
import { requireAuth, requireIgdb } from '../middleware.js';
import { recommendationDto } from '../serialize.js';

export function recommendationsRoutes(deps: RouteDeps) {
  const r = new Hono<AppVars>();
  r.use('*', requireAuth());

  r.get('/', async (c) => {
    const { device, limit } = parseQuery(c, recommendationsQuerySchema);
    const { cache } = requireIgdb(deps);
    const userId = c.get('user').id;
    const body = await cachedRecommendations(
      deps.db,
      userId,
      recommendationCacheKey({ device, limit }),
      async () => {
        const recs = await recommendForUser({ ...deps, cache }, userId, {
          device,
          limit,
          warmTimeToBeat: true,
        });
        return { recommendations: recs.map(recommendationDto) } satisfies RecommendationsResponse;
      },
    );
    // Model reasons are laid over the cached picks, never stored in the cache payload.
    const { recommendations, pending } = await deps.reasons.overlay(userId, body.recommendations);
    return c.json({
      recommendations,
      ...(pending ? { reasonsPending: true } : {}),
    } satisfies RecommendationsResponse);
  });

  return r;
}
