import { eq } from 'drizzle-orm';
import { Hono, type Context } from 'hono';
import {
  IMPORT_MAX_LINES,
  deleteLibraryEntry,
  findLibraryEntry,
  idParamSchema,
  exportImportSchema,
  importConfirmSchema,
  importExportGames,
  importLibraryGames,
  importPreviewSchema,
  libraryBulkStatusSchema,
  libraryCreateSchema,
  libraryPatchSchema,
  listLibrary,
  previewImport,
  rebuildProfile,
  setLibraryStatus,
  updateLibraryEntry,
  upsertLibraryGame,
  STEAM_NOT_CONFIGURED_HELP,
  STEAM_NOT_LINKED_HELP,
  STEAM_PRIVATE_HELP,
  STEAM_UNAVAILABLE_HELP,
  SteamAccountChangedError,
  SteamNetworkError,
  SteamProfilePrivateError,
  XBOX_BUSY_HELP,
  XBOX_COOLDOWN_HELP,
  XBOX_NOT_CONFIGURED_HELP,
  XBOX_NOT_FOUND_HELP,
  XBOX_NOT_LINKED_HELP,
  XBOX_PRIVATE_HELP,
  XBOX_UNAVAILABLE_HELP,
  XboxAccountChangedError,
  XboxGamertagNotFoundError,
  XboxNetworkError,
  XboxProfilePrivateError,
  XboxRateLimitedError,
  lookupXuid,
  xboxLinkSchema,
  type ImportPreviewResponse,
  type SteamSyncError,
  type XboxSyncError,
} from '@perch/core';
import { schema } from '@perch/db';
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
      return steamError(c, 400, { error: 'steam_not_linked', message: STEAM_NOT_LINKED_HELP });
    requireIgdb(deps);
    if (!deps.env.STEAM_API_KEY)
      return steamError(c, 503, {
        error: 'steam_not_configured',
        message: STEAM_NOT_CONFIGURED_HELP,
      });
    try {
      return c.json(await deps.steamSync.run(id, steamId));
    } catch (err) {
      if (err instanceof SteamProfilePrivateError)
        return steamError(c, 409, { error: 'steam_profile_private', message: STEAM_PRIVATE_HELP });
      if (err instanceof SteamAccountChangedError)
        return steamError(c, 400, { error: 'steam_not_linked', message: STEAM_NOT_LINKED_HELP });
      if (err instanceof SteamNetworkError) {
        console.error(err);
        return steamError(c, 502, {
          error: 'steam_unavailable',
          message: STEAM_UNAVAILABLE_HELP,
        });
      }
      throw err;
    }
  });

  const xboxError = (c: Context, status: 400 | 404 | 409 | 429 | 502 | 503, body: XboxSyncError) =>
    c.json(body, status);

  /** Null when the user may call OpenXBL now; else the 429 answer (one call per minute per user). */
  function xboxThrottled(c: Context, userId: string) {
    const retryAfter = deps.xboxSync.cooldown(userId);
    if (retryAfter === 0) return null;
    c.header('Retry-After', String(retryAfter));
    return xboxError(c, 429, { error: 'xbox_cooldown', message: XBOX_COOLDOWN_HELP, retryAfter });
  }

  /** Typed Xbox failures as JSON error bodies; anything else is a 500. */
  function xboxFailure(c: Context, err: unknown) {
    if (err instanceof XboxProfilePrivateError)
      return xboxError(c, 409, { error: 'xbox_private', message: XBOX_PRIVATE_HELP });
    if (err instanceof XboxGamertagNotFoundError)
      return xboxError(c, 404, { error: 'xbox_not_found', message: XBOX_NOT_FOUND_HELP });
    if (err instanceof XboxRateLimitedError)
      return xboxError(c, 429, { error: 'xbox_busy', message: XBOX_BUSY_HELP });
    if (err instanceof XboxAccountChangedError)
      return xboxError(c, 400, { error: 'xbox_not_linked', message: XBOX_NOT_LINKED_HELP });
    if (err instanceof XboxNetworkError) {
      console.error(err);
      return xboxError(c, 502, { error: 'xbox_unavailable', message: XBOX_UNAVAILABLE_HELP });
    }
    throw err;
  }

  // Looks the gamertag up (exact match only), caches its xuid on the user, then imports.
  r.post('/xbox/link', async (c) => {
    const { id } = c.get('user');
    const { gamertag } = await parseBody(c, xboxLinkSchema);
    requireIgdb(deps);
    if (!deps.env.OPENXBL_API_KEY)
      return xboxError(c, 503, { error: 'xbox_not_configured', message: XBOX_NOT_CONFIGURED_HELP });
    const throttled = xboxThrottled(c, id);
    if (throttled) return throttled;
    try {
      const profile = await lookupXuid(gamertag, {
        apiKey: deps.env.OPENXBL_API_KEY,
        fetch: deps.xboxFetch,
      });
      await db
        .update(schema.users)
        .set({ xboxXuid: profile.xuid, xboxGamertag: profile.gamertag, xboxSyncedAt: null })
        .where(eq(schema.users.id, id));
      // The link stays even if the import fails (e.g. a private history): fix it, then resync.
      return c.json(await deps.xboxSync.run(id, profile.xuid));
    } catch (err) {
      return xboxFailure(c, err);
    }
  });

  r.post('/xbox/sync', async (c) => {
    const { id, xboxXuid } = c.get('user');
    if (!xboxXuid)
      return xboxError(c, 400, { error: 'xbox_not_linked', message: XBOX_NOT_LINKED_HELP });
    requireIgdb(deps);
    if (!deps.env.OPENXBL_API_KEY)
      return xboxError(c, 503, { error: 'xbox_not_configured', message: XBOX_NOT_CONFIGURED_HELP });
    const throttled = xboxThrottled(c, id);
    if (throttled) return throttled;
    try {
      return c.json(await deps.xboxSync.run(id, xboxXuid));
    } catch (err) {
      return xboxFailure(c, err);
    }
  });

  // Imported entries stay; only the link and the sync time go.
  r.delete('/xbox', async (c) => {
    await db
      .update(schema.users)
      .set({ xboxXuid: null, xboxGamertag: null, xboxSyncedAt: null })
      .where(eq(schema.users.id, c.get('user').id));
    return c.json({ ok: true });
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

  // Bulk, no review: matched games are added, the rest come back as `unmatched`.
  r.post('/import/export', async (c) => {
    const userId = c.get('user').id;
    const { games } = await parseBody(c, exportImportSchema);
    const { client, cache } = requireIgdb(deps);
    const result = await importExportGames({ db, cache, client }, userId, games);
    await rebuild(userId);
    return c.json(result);
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

  // One status for many of the user's entries (the "played before" prompt after an import).
  r.post('/bulk-status', async (c) => {
    const userId = c.get('user').id;
    const { ids, status } = await parseBody(c, libraryBulkStatusSchema);
    const { updated } = await setLibraryStatus(db, userId, ids, status);
    if (updated > 0) await rebuild(userId);
    return c.json({ updated });
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
