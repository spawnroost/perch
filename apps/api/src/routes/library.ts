import { Hono, type Context } from 'hono';
import {
  IMPORT_MAX_LINES,
  deleteLibraryEntry,
  findLibraryEntry,
  idParamSchema,
  importConfirmSchema,
  importLibraryGames,
  importPreviewSchema,
  libraryCreateSchema,
  libraryPatchSchema,
  listLibrary,
  previewImport,
  rebuildProfile,
  updateLibraryEntry,
  upsertLibraryGame,
  STEAM_PRIVATE_HELP,
  SteamNetworkError,
  SteamNotConfiguredError,
  SteamProfilePrivateError,
  type ImportPreviewResponse,
  type SteamSyncError,
} from '@perch/core';
import type { AppVars, RouteDeps } from '../app.js';
import { parseBody, parseParams } from '../http.js';
import { requireAuth, requireIgdb } from '../middleware.js';
import { iso, libraryDto } from '../serialize.js';

export function libraryRoutes(deps: RouteDeps) {
  const { db, mapVocab } = deps;
  const r = new Hono<AppVars>();
  r.use('*', requireAuth());
  const rebuild = (userId: string) => rebuildProfile(db, userId, new Date(), mapVocab);

  r.get('/', async (c) => {
    const rows = await listLibrary(db, c.get('user').id);
    return c.json({ entries: rows.map(libraryDto) });
  });

  r.post('/', async (c) => {
    const userId = c.get('user').id;
    const body = await parseBody(c, libraryCreateSchema);
    const { cache } = requireIgdb(deps);
    const { created } = await upsertLibraryGame(
      { db, cache, mapVocab },
      userId,
      {
        igdbId: body.igdbId,
        platform: body.platform,
        hours: body.hoursPlayed,
        lastPlayed: body.lastPlayed,
        status: body.status,
        owned: body.owned,
      },
      'manual',
    );
    await rebuild(userId);
    const entry = await findLibraryEntry(db, userId, body.igdbId, body.platform);
    if (!entry) return c.json({ error: 'library entry not found' }, 404);
    return c.json({ entry: libraryDto(entry) }, created ? 201 : 200);
  });

  const steamError = (c: Context, status: 400 | 409 | 502 | 503, body: SteamSyncError) =>
    c.json(body, status);

  r.post('/steam/sync', async (c) => {
    const { id, steamId } = c.get('user');
    if (!steamId)
      return steamError(c, 400, {
        error: 'steam_not_linked',
        message: 'Link your Steam account before syncing.',
      });
    requireIgdb(deps);
    if (!deps.env.STEAM_API_KEY)
      return steamError(c, 503, {
        error: 'steam_not_configured',
        message: 'Steam library sync is not set up on this server.',
      });
    try {
      return c.json(await deps.steamSync.run(id, steamId));
    } catch (err) {
      if (err instanceof SteamProfilePrivateError)
        return steamError(c, 409, { error: 'steam_profile_private', message: STEAM_PRIVATE_HELP });
      if (err instanceof SteamNotConfiguredError)
        return steamError(c, 503, {
          error: 'steam_not_configured',
          message: 'Steam library sync is not set up on this server.',
        });
      if (err instanceof SteamNetworkError) {
        console.error(err);
        return steamError(c, 502, {
          error: 'steam_unavailable',
          message: 'Steam could not be reached. Try again in a moment.',
        });
      }
      throw err;
    }
  });

  // Registered before '/:id' so "import" is never read as an id.
  r.post('/import', async (c) => {
    const { text } = await parseBody(c, importPreviewSchema);
    const { client } = requireIgdb(deps);
    const { lines, errors } = await previewImport(client, text, IMPORT_MAX_LINES);
    return c.json({
      lines: lines.map((l) => ({
        line: l.line,
        name: l.entry.name,
        hoursPlayed: l.entry.hours ?? null,
        lastPlayed: iso(l.entry.lastPlayed ?? null),
        status: l.entry.status ?? null,
        match: l.match,
        suggestions: l.suggestions,
      })),
      errors,
    } satisfies ImportPreviewResponse);
  });

  r.post('/import/confirm', async (c) => {
    const userId = c.get('user').id;
    const body = await parseBody(c, importConfirmSchema);
    const { cache } = requireIgdb(deps);
    const { imported, failed } = await importLibraryGames({ db, cache, mapVocab }, userId, {
      platform: body.platform,
      owned: body.owned,
      items: body.items.map((i) => ({
        igdbId: i.igdbId,
        hours: i.hoursPlayed,
        lastPlayed: i.lastPlayed,
        status: i.status,
      })),
    });
    if (imported.length > 0) await rebuild(userId);
    return c.json({ imported, failed });
  });

  r.patch('/:id', async (c) => {
    const userId = c.get('user').id;
    const { id } = parseParams(c, idParamSchema);
    const patch = await parseBody(c, libraryPatchSchema);
    const row = await updateLibraryEntry(db, userId, id, patch);
    if (!row) return c.json({ error: 'not found' }, 404);
    await rebuild(userId);
    return c.json({ entry: libraryDto(row) });
  });

  r.delete('/:id', async (c) => {
    const userId = c.get('user').id;
    const { id } = parseParams(c, idParamSchema);
    if (!(await deleteLibraryEntry(db, userId, id))) return c.json({ error: 'not found' }, 404);
    await rebuild(userId);
    return c.json({ ok: true });
  });

  return r;
}
