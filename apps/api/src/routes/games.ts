import { Hono } from 'hono';
import {
  buildGameFacts,
  explainGameForUser,
  gameFitForUser,
  gameFitQuerySchema,
  gameFitsForUser,
  gameSearchQuerySchema,
  igdbIdParamSchema,
  similarForUser,
  similarQuerySchema,
  soundtrackFor,
  soundtrackLinks,
  steamReviewsFor,
  toTimeToBeatHours,
  type GameDetailResponse,
  type GameFitsResponse,
  type GameSearchResponse,
  type SimilarResponse,
  type SoundtrackResponse,
} from '@perch/core';
import type { AppVars, RouteDeps } from '../app.js';
import { parseParams, parseQuery } from '../http.js';
import { requireAuth, requireIgdb } from '../middleware.js';
import { iso, recommendationDto } from '../serialize.js';

/** How long the search palette waits on cold Steam lookups before answering with what is ready. */
const FIT_BUDGET_MS = 1200;

export function gamesRoutes(deps: RouteDeps) {
  const r = new Hono<AppVars>();
  r.use('*', requireAuth());

  r.get('/search', async (c) => {
    const { q } = parseQuery(c, gameSearchQuerySchema);
    const { client } = requireIgdb(deps);
    const { candidates } = await client.searchGames(q);
    return c.json({
      results: candidates.map((g) => ({
        igdbId: g.igdbId,
        name: g.name,
        slug: g.slug,
        ratingCount: g.ratingCount,
        firstRelease: iso(g.firstRelease),
        coverUrl: g.coverUrl,
        coverUrlSmall: g.coverUrlSmall,
      })),
    } satisfies GameSearchResponse);
  });

  // Registered before `/:igdbId`, which would otherwise take "fit" as an id.
  r.get('/fit', async (c) => {
    const { ids } = parseQuery(c, gameFitQuerySchema);
    const { cache } = requireIgdb(deps);
    const found = await cache.getGames(ids);
    const { fits, pending } = await gameFitsForUser(deps, c.get('user').id, found, {
      budgetMs: FIT_BUDGET_MS,
    });
    return c.json({ fits, pending } satisfies GameFitsResponse);
  });

  r.get('/:igdbId/similar', async (c) => {
    const { igdbId } = parseParams(c, igdbIdParamSchema);
    const { device } = parseQuery(c, similarQuerySchema);
    const { cache } = requireIgdb(deps);
    const found = await similarForUser({ ...deps, cache }, c.get('user').id, igdbId, {
      device,
      warmTimeToBeat: true,
    });
    if (!found) return c.json({ error: 'game not found' }, 404);
    return c.json({
      game: found.game,
      recommendations: found.picks.map(recommendationDto),
    } satisfies SimilarResponse);
  });

  r.get('/:igdbId/soundtrack', async (c) => {
    const { igdbId } = parseParams(c, igdbIdParamSchema);
    const { cache } = requireIgdb(deps);
    const game = await cache.getGame(igdbId);
    if (!game) return c.json({ error: 'game not found' }, 404);
    // Cached for a week; the first visit waits briefly on the rate-limited iTunes lookup.
    const soundtrack = await soundtrackFor(deps.db, game, { client: deps.soundtrack });
    return c.json({
      soundtrack,
      links: soundtrackLinks(game.name, soundtrack?.appleMusicUrl ?? null),
    } satisfies SoundtrackResponse);
  });

  r.get('/:igdbId', async (c) => {
    const { igdbId } = parseParams(c, igdbIdParamSchema);
    const { cache } = requireIgdb(deps);
    const userId = c.get('user').id;
    const game = await cache.getGame(igdbId);
    if (!game) return c.json({ error: 'game not found' }, 404);
    const [{ deck, fits }, why, timeToBeat, steamReviews] = await Promise.all([
      gameFitForUser(deps, userId, game),
      explainGameForUser(deps, userId, game),
      // IGDB hiccups on this extra must not fail the page.
      cache.getTimeToBeat(igdbId).catch(() => null),
      // Warmed in the background; the first visit may answer without it.
      steamReviewsFor(deps.db, game, { client: deps.steam }),
    ]);
    return c.json({
      game: {
        igdbId: game.igdbId,
        name: game.name,
        slug: game.slug,
        coverUrl: game.coverUrl,
        coverUrlSmall: game.coverUrlSmall,
        heroUrl: game.heroUrl,
        accent: game.accent,
        summary: game.summary,
        firstRelease: iso(game.firstRelease),
        platforms: game.platforms,
        rating: game.rating,
        ratingCount: game.ratingCount,
        steamAppId: game.steamAppId,
      },
      fit: fits,
      timeToBeat: toTimeToBeatHours(timeToBeat, 1),
      deck,
      facts: buildGameFacts(game, steamReviews),
      why,
    } satisfies GameDetailResponse);
  });

  return r;
}
