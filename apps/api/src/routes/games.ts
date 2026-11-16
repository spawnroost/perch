import { Hono } from 'hono';
import {
  explainGameForUser,
  gameFitForUser,
  gameSearchQuerySchema,
  igdbIdParamSchema,
  listDevices,
  type GameDetailResponse,
  type GameSearchResponse,
} from '@perch/core';
import type { AppVars, RouteDeps } from '../app.js';
import { parseParams, parseQuery } from '../http.js';
import { requireAuth, requireIgdb } from '../middleware.js';

const MAX_RESULTS = 25;

export function gamesRoutes(deps: RouteDeps) {
  const r = new Hono<AppVars>();
  r.use('*', requireAuth());

  r.get('/search', async (c) => {
    const { q } = parseQuery(c, gameSearchQuerySchema);
    const { client } = requireIgdb(deps);
    const { candidates } = await client.searchGames(q);
    return c.json({
      results: candidates.slice(0, MAX_RESULTS).map((g) => ({
        igdbId: g.igdbId,
        name: g.name,
        slug: g.slug,
        ratingCount: g.ratingCount,
        firstRelease: g.firstRelease?.toISOString() ?? null,
      })),
    } satisfies GameSearchResponse);
  });

  r.get('/:igdbId', async (c) => {
    const { igdbId } = parseParams(c, igdbIdParamSchema);
    const { cache } = requireIgdb(deps);
    const userId = c.get('user').id;
    const game = await cache.getGame(igdbId);
    if (!game) return c.json({ error: 'game not found' }, 404);
    const [{ deck, fits }, why, devices] = await Promise.all([
      gameFitForUser(deps, userId, game),
      explainGameForUser(deps, userId, game),
      listDevices(deps.db, userId),
    ]);
    const names = new Map(devices.map((d) => [d.id, d.name]));
    return c.json({
      game: {
        igdbId: game.igdbId,
        name: game.name,
        slug: game.slug,
        coverUrl: game.coverUrl,
        firstRelease: game.firstRelease?.toISOString() ?? null,
        platforms: game.platforms,
        rating: game.rating,
        ratingCount: game.ratingCount,
        steamAppId: game.steamAppId,
      },
      fit: fits.map((f) => ({
        deviceId: f.deviceId,
        deviceName: names.get(f.deviceId) ?? '',
        status: f.status,
      })),
      deck,
      why,
    } satisfies GameDetailResponse);
  });

  return r;
}
