import { Hono } from 'hono';
import {
  DEVICE_PRESETS,
  addDevice,
  deleteDevice,
  deviceCreateSchema,
  devicePatchSchema,
  hardwareQuerySchema,
  idParamSchema,
  listDevices,
  searchCpus,
  searchGpus,
  updateDevice,
  type DevicePresetsResponse,
} from '@perch/core';
import type { AppVars, RouteDeps } from '../app.js';
import { parseBody, parseParams, parseQuery } from '../http.js';
import { requireAuth } from '../middleware.js';
import { deviceDto } from '../serialize.js';

export function devicesRoutes({ db }: Pick<RouteDeps, 'db'>) {
  const r = new Hono<AppVars>();

  // Public: registered before the auth middleware.
  r.get('/presets', (c) =>
    c.json({
      presets: DEVICE_PRESETS.map((p) => ({
        id: p.id,
        name: p.name,
        platformIds: p.platformIds,
        hasHardware: p.hardware !== undefined,
        deckCompat: p.deckCompat ?? false,
      })),
    } satisfies DevicePresetsResponse),
  );

  r.use('*', requireAuth());

  r.get('/', async (c) => {
    const rows = await listDevices(db, c.get('user').id);
    return c.json({ devices: rows.map(deviceDto) });
  });

  r.post('/', async (c) => {
    const input = await parseBody(c, deviceCreateSchema);
    const device = await addDevice(db, c.get('user').id, input);
    return c.json({ device: deviceDto(device) }, 201);
  });

  r.patch('/:id', async (c) => {
    const { id } = parseParams(c, idParamSchema);
    const patch = await parseBody(c, devicePatchSchema);
    const device = await updateDevice(db, c.get('user').id, id, patch);
    if (!device) return c.json({ error: 'not found' }, 404);
    return c.json({ device: deviceDto(device) });
  });

  r.delete('/:id', async (c) => {
    const { id } = parseParams(c, idParamSchema);
    if (!(await deleteDevice(db, c.get('user').id, id))) return c.json({ error: 'not found' }, 404);
    return c.json({ ok: true });
  });

  return r;
}

/** Public autocomplete over the GPU / CPU tier tables. */
export function hardwareRoutes() {
  const r = new Hono<AppVars>();
  r.get('/gpus', (c) => {
    const { q, limit } = parseQuery(c, hardwareQuerySchema);
    return c.json({ results: searchGpus(q, limit) });
  });
  r.get('/cpus', (c) => {
    const { q, limit } = parseQuery(c, hardwareQuerySchema);
    return c.json({ results: searchCpus(q, limit) });
  });
  return r;
}
