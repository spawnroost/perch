import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createDb, devices, runMigrations, users, type Db } from '@perch/db';
import {
  addDevice,
  deleteDevice,
  listDevices,
  removeDevice,
  selectDevices,
  DEVICE_PRESETS,
} from '../../src/index.js';

const url = process.env.DATABASE_URL_TEST;
if (!url) console.warn('[skip] DATABASE_URL_TEST is not set; devices db tests skipped');

const USER = 'devices-db-test-user';

describe.skipIf(!url)('device store', () => {
  let db: Db;
  beforeAll(async () => {
    await runMigrations(url!);
    db = createDb(url!);
    await db.delete(users).where(eq(users.id, USER));
    await db.insert(users).values({ id: USER, name: 'T', email: 'devices-db@test.local' });
  });
  afterAll(async () => {
    await db?.delete(users).where(eq(users.id, USER));
    await db?.$client.end({ timeout: 1 });
  });

  it('preset copies platforms and scored hardware', async () => {
    const d = await addDevice(db, USER, { preset: 'steam-deck' });
    const preset = DEVICE_PRESETS.find((p) => p.id === 'steam-deck')!;
    expect(d.kind).toBe('steam-deck');
    expect(d.platformIds).toEqual(preset.platformIds);
    expect(d.gpuScore).toBeGreaterThan(0);
    expect(d.cpuScore).toBeGreaterThan(0);
    expect(d.ramGb).toBe(16);
  });

  it('console preset has no hardware', async () => {
    const d = await addDevice(db, USER, { preset: 'ps5' });
    expect(d.gpuScore).toBeNull();
  });

  it('pc stores names and scores', async () => {
    const d = await addDevice(db, USER, {
      pc: { gpu: 'GTX 750 Ti', cpu: 'i3-4130', ramGb: 8 },
    });
    expect(d.kind).toBe('pc');
    expect(d.gpuName).toBe('GTX 750 Ti');
    expect(d.gpuScore).toBeGreaterThan(0);
    expect(d.cpuScore).toBeGreaterThan(0);
    expect(d.ramGb).toBe(8);
  });

  it('unknown GPU or CPU is an error naming it', async () => {
    await expect(
      addDevice(db, USER, { pc: { gpu: 'Banana 9000', cpu: 'i3-4130', ramGb: 8 } }),
    ).rejects.toThrow(/unknown GPU "Banana 9000"/);
    await expect(
      addDevice(db, USER, { pc: { gpu: 'GTX 750 Ti', cpu: 'Zorp', ramGb: 8 } }),
    ).rejects.toThrow(/unknown CPU "Zorp"/);
  });

  it('rejects unknown presets', async () => {
    await expect(addDevice(db, USER, { preset: 'nope' })).rejects.toThrow(/unknown preset/);
  });

  it('--default moves the default flag; list puts it first', async () => {
    const a = await addDevice(db, USER, { preset: 'switch', isDefault: true });
    const b = await addDevice(db, USER, { preset: 'mac', isDefault: true });
    const list = await listDevices(db, USER);
    expect(list[0]!.id).toBe(b.id);
    expect(list.filter((d) => d.isDefault)).toHaveLength(1);
    expect(list.find((d) => d.id === a.id)!.isDefault).toBe(false);
  });

  describe('default invariant', () => {
    const U2 = 'devices-db-test-user-2';
    beforeAll(async () => {
      await db.delete(users).where(eq(users.id, U2));
      await db.insert(users).values({ id: U2, name: 'T2', email: 'devices-db-2@test.local' });
    });
    afterAll(async () => {
      await db?.delete(users).where(eq(users.id, U2));
    });

    it('first device becomes default, later ones do not', async () => {
      const a = await addDevice(db, U2, { preset: 'switch' });
      const b = await addDevice(db, U2, { preset: 'mac' });
      expect(a.isDefault).toBe(true);
      expect(b.isDefault).toBe(false);
    });

    it('deleting the default promotes the oldest remaining device', async () => {
      const [first] = await listDevices(db, U2);
      const c = await addDevice(db, U2, { preset: 'ps5' });
      await deleteDevice(db, U2, first!.id);
      const list = await listDevices(db, U2);
      expect(list).toHaveLength(2);
      expect(list.filter((d) => d.isDefault)).toHaveLength(1);
      expect(list[0]!.id).not.toBe(c.id); // mac (older) is promoted, not ps5
      expect(list[0]!.kind).toBe('mac');
    });

    it('deleting a non-default device keeps the default; deleting the last leaves none', async () => {
      const [def, other] = await listDevices(db, U2);
      await deleteDevice(db, U2, other!.id);
      expect((await listDevices(db, U2))[0]!.id).toBe(def!.id);
      await removeDevice(db, U2, def!.id);
      expect(await listDevices(db, U2)).toHaveLength(0);
    });
  });

  it('removeDevice deletes own device and errors on unknown id', async () => {
    const list = await listDevices(db, USER);
    await removeDevice(db, USER, list[0]!.id);
    expect(await db.select().from(devices).where(eq(devices.id, list[0]!.id))).toHaveLength(0);
    await expect(removeDevice(db, USER, list[0]!.id)).rejects.toThrow(/no device/);
  });

  it('removeDevice accepts a unique id prefix, rejects ambiguous or unknown ones', async () => {
    const base = { userId: USER, kind: 'pc', name: 'P', platformIds: [6] };
    const ids = ['abcd0000-0000-4000-8000-000000000001', 'abcd0000-0000-4000-8000-000000000002'];
    await db.insert(devices).values(ids.map((id) => ({ ...base, id })));
    await expect(removeDevice(db, USER, 'abcd0000')).rejects.toThrow(/ambiguous/);
    await expect(removeDevice(db, USER, 'zzzz')).rejects.toThrow(/no device/);
    await expect(
      removeDevice(db, 'someone-else', 'abcd0000-0000-4000-8000-000000000001'),
    ).rejects.toThrow(/no device/);
    await removeDevice(db, USER, 'ABCD0000-0000-4000-8000-000000000001');
    await removeDevice(db, USER, 'abcd0000-0000-4000-8000-000000000002');
    expect(await db.select().from(devices).where(eq(devices.id, ids[0]!))).toHaveLength(0);
  });
});

describe('selectDevices', () => {
  const mk = (id: string, kind: string) =>
    ({ id, kind, platformIds: [], gpuScore: null, cpuScore: null, ramGb: null }) as const;
  const all = [mk('u1', 'steam-deck'), mk('u2', 'pc'), mk('u3', 'ps5')];
  it('defaults and "all" keep every device', () => {
    expect(selectDevices(all, undefined)).toHaveLength(3);
    expect(selectDevices(all, 'all')).toHaveLength(3);
  });
  it('"none" switches filtering off', () => {
    expect(selectDevices(all, 'none')).toEqual([]);
  });
  it('matches by device id or preset id', () => {
    expect(selectDevices(all, 'u2').map((d) => d.id)).toEqual(['u2']);
    expect(selectDevices(all, 'steam-deck').map((d) => d.id)).toEqual(['u1']);
  });
  it('errors when nothing matches', () => {
    expect(() => selectDevices(all, 'xbox-series')).toThrow(/no device matches/);
  });
});
