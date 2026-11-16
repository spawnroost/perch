import { Hono } from 'hono';
import {
  IMPORT_MAX_LINES,
  GameNotFoundError,
  deleteLibraryEntry,
  findLibraryEntry,
  formatError,
  idParamSchema,
  importConfirmSchema,
  importPreviewSchema,
  libraryCreateSchema,
  libraryPatchSchema,
  listLibrary,
  previewImport,
  rebuildProfile,
  updateLibraryEntry,
  upsertLibraryGame,
  type ImportPreviewResponse,
} from '@perch/core';
import type { AppVars, RouteDeps } from '../app.js';
import { parseBody, parseParams } from '../http.js';
import { requireAuth, requireIgdb } from '../middleware.js';
import { libraryDto } from '../serialize.js';

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
        lastPlayed: l.entry.lastPlayed?.toISOString() ?? null,
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
    const imported: { igdbId: number; name: string }[] = [];
    const failed: { igdbId: number; error: string }[] = [];
    const found = new Map(
      (await cache.getGames(body.items.map((i) => i.igdbId))).map((g) => [g.igdbId, g]),
    );
    for (const item of body.items) {
      try {
        const game = found.get(item.igdbId);
        if (!game) throw new GameNotFoundError(item.igdbId);
        const { igdbId, name } = await upsertLibraryGame(
          { db, cache, mapVocab },
          userId,
          {
            igdbId: item.igdbId,
            platform: body.platform,
            hours: item.hoursPlayed,
            lastPlayed: item.lastPlayed,
            status: item.status,
            owned: body.owned,
          },
          'import',
          game,
        );
        imported.push({ igdbId, name });
      } catch (e) {
        failed.push({ igdbId: item.igdbId, error: formatError(e) });
      }
    }
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
