import { Hono } from 'hono';
import {
  browseForUser,
  browseFacets,
  browseQuerySchema,
  memoizeTagQuery,
  type BrowseFacetsResponse,
  type BrowseResponse,
  type IgdbCache,
} from '@perch/core';
import type { AppVars, RouteDeps } from '../app.js';
import { parseQuery } from '../http.js';
import { requireAuth, requireIgdb } from '../middleware.js';
import { recommendationDto } from '../serialize.js';

export function browseRoutes(deps: RouteDeps) {
  const r = new Hono<AppVars>();
  r.use('*', requireAuth());

  // "Load more" re-asks for the same pool of games: remember it, so IGDB is hit once per tag set.
  let pooled: { cache: IgdbCache; queryByTags: IgdbCache['queryByTags'] } | null = null;
  const cacheWithMemo = (cache: IgdbCache): IgdbCache => {
    if (pooled?.cache !== cache)
      pooled = { cache, queryByTags: memoizeTagQuery(cache.queryByTags) };
    return { ...cache, queryByTags: pooled.queryByTags };
  };

  r.get('/facets', (c) => c.json(browseFacets() satisfies BrowseFacetsResponse));

  r.get('/', async (c) => {
    const { genres, themes, deviceId, limit, offset } = parseQuery(c, browseQuerySchema);
    const { cache } = requireIgdb(deps);
    const { picks, hasMore } = await browseForUser(
      { ...deps, cache: cacheWithMemo(cache) },
      c.get('user').id,
      { genres, themes, device: deviceId, limit, offset, warmTimeToBeat: true },
    );
    return c.json({
      recommendations: picks.map(recommendationDto),
      hasMore,
    } satisfies BrowseResponse);
  });

  return r;
}
