import { Hono } from 'hono';
import { rouletteForUser, rouletteQuerySchema, type RouletteResponse } from '@perch/core';
import type { AppVars, RouteDeps } from '../app.js';
import { parseQuery } from '../http.js';
import { requireAuth, requireIgdb } from '../middleware.js';
import { recommendationDto } from '../serialize.js';

export function rouletteRoutes(deps: RouteDeps) {
  const r = new Hono<AppVars>();
  r.use('*', requireAuth());

  r.get('/', async (c) => {
    const query = parseQuery(c, rouletteQuerySchema);
    const { cache } = requireIgdb(deps);
    const out = await rouletteForUser({ ...deps, cache }, c.get('user').id, query);
    return c.json(
      (out
        ? {
            pick: { ...recommendationDto(out.pick), sessionReason: out.pick.sessionReason },
            relaxed: out.relaxed,
          }
        : { pick: null, relaxed: null }) satisfies RouletteResponse,
    );
  });

  return r;
}
