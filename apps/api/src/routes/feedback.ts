import { Hono } from 'hono';
import { addFeedback, feedbackBodySchema, rebuildProfile } from '@perch/core';
import type { AppVars, RouteDeps } from '../app.js';
import { parseBody } from '../http.js';
import { requireAuth, requireIgdb } from '../middleware.js';

export function feedbackRoutes(deps: RouteDeps) {
  const { db, mapVocab } = deps;
  const r = new Hono<AppVars>();
  r.use('*', requireAuth());

  r.post('/', async (c) => {
    const userId = c.get('user').id;
    const { igdbId, kind } = await parseBody(c, feedbackBodySchema);
    const { cache } = requireIgdb(deps);
    await addFeedback({ db, cache }, userId, igdbId, kind);
    await rebuildProfile(db, userId, new Date(), mapVocab);
    return c.json({ igdbId, kind });
  });

  return r;
}

export function profileRoutes({ db, mapVocab }: Pick<RouteDeps, 'db' | 'mapVocab'>) {
  const r = new Hono<AppVars>();
  r.use('*', requireAuth());

  r.post('/rebuild', async (c) => {
    const now = new Date();
    await rebuildProfile(db, c.get('user').id, now, mapVocab);
    return c.json({ ok: true, builtAt: now.toISOString() });
  });

  return r;
}
