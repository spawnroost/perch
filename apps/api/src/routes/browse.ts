import { Hono } from 'hono';
import {
  browseForUser,
  browseFacets,
  browseQuerySchema,
  type BrowseFacetsResponse,
  type BrowseResponse,
} from '@perch/core';
import type { AppVars, RouteDeps } from '../app.js';
import { parseQuery } from '../http.js';
import { requireAuth, requireIgdb } from '../middleware.js';
import { recommendationDto } from '../serialize.js';

export function browseRoutes(deps: RouteDeps) {
  const r = new Hono<AppVars>();
  r.use('*', requireAuth());

  r.get('/facets', (c) => c.json(browseFacets() satisfies BrowseFacetsResponse));

  r.get('/', async (c) => {
    const { genres, themes, deviceId, limit, offset } = parseQuery(c, browseQuerySchema);
    const { cache } = requireIgdb(deps);
    const { picks, hasMore } = await browseForUser({ ...deps, cache }, c.get('user').id, {
      genres,
      themes,
      device: deviceId,
      limit,
      offset,
      warmTimeToBeat: true,
    });
    return c.json({
      recommendations: picks.map(recommendationDto),
      hasMore,
    } satisfies BrowseResponse);
  });

  return r;
}
