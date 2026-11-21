import { Hono } from 'hono';
import {
  igdbIdParamSchema,
  listWatches,
  pricesLookup,
  removeWatch,
  setWatch,
  WatchLimitError,
  watchBodySchema,
  type WatchListResponse,
  type WatchResponse,
} from '@perch/core';
import type { AppVars, RouteDeps } from '../app.js';
import { parseBody, parseParams } from '../http.js';
import { requireAuth, requireIgdb } from '../middleware.js';
import { iso } from '../serialize.js';

export function watchesRoutes(deps: RouteDeps) {
  const { db } = deps;
  const r = new Hono<AppVars>();
  r.use('*', requireAuth());

  r.get('/', async (c) => {
    const rows = await listWatches(db, c.get('user').id);
    const watches = await Promise.all(
      rows.map(async (w) => {
        // Cached prices only: a cold or stale game is looked up in the background, not awaited.
        const { prices } = await pricesLookup(db, w, { client: deps.prices, waitMs: 0 });
        return {
          igdbId: w.igdbId,
          name: w.name,
          slug: w.slug,
          coverUrlSmall: w.coverUrlSmall,
          accent: w.accent,
          targetPrice: w.targetPrice,
          createdAt: iso(w.createdAt)!,
          prices,
        };
      }),
    );
    return c.json({ watches } satisfies WatchListResponse);
  });

  r.put('/:igdbId', async (c) => {
    const { igdbId } = parseParams(c, igdbIdParamSchema);
    const { targetPrice } = await parseBody(c, watchBodySchema);
    const { cache } = requireIgdb(deps);
    // The games cache row is the watch's foreign key.
    if (!(await cache.getGame(igdbId))) return c.json({ error: 'game not found' }, 404);
    try {
      await setWatch(db, c.get('user').id, igdbId, targetPrice);
    } catch (err) {
      if (err instanceof WatchLimitError) return c.json({ error: err.message }, 409);
      throw err;
    }
    return c.json({ igdbId, targetPrice } satisfies WatchResponse);
  });

  r.delete('/:igdbId', async (c) => {
    const { igdbId } = parseParams(c, igdbIdParamSchema);
    await removeWatch(db, c.get('user').id, igdbId);
    return c.json({ ok: true });
  });

  return r;
}
