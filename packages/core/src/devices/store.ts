import { and, asc, eq } from 'drizzle-orm';
import { devices, type Db } from '@perch/db';
import { matchCpu, matchGpu } from '../hardware/tiers.js';
import type { FilterDevice } from '../engine/filters.js';
import { DEVICE_PRESETS, getPreset, IGDB_PLATFORM } from './presets.js';

export type Device = typeof devices.$inferSelect;

/** The caller's input is wrong (unknown preset/GPU/CPU, bad RAM): a 400, not a crash. */
export class DeviceInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DeviceInputError';
  }
}

/** No such device for this user (also: someone else's device). */
export class DeviceNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DeviceNotFoundError';
  }
}

export type AddDeviceInput = { isDefault?: boolean } & (
  | { preset: string; pc?: undefined }
  | { pc: { gpu: string; cpu: string; ramGb: number; name?: string }; preset?: undefined }
);

/** IGDB platforms a custom PC plays. */
const PC_PLATFORMS = [IGDB_PLATFORM.windows, IGDB_PLATFORM.linux];

function scoreGpu(name: string) {
  const m = matchGpu(name);
  if (!m) throw new DeviceInputError(`unknown GPU "${name}" (not in the GPU tier list)`);
  return m.score;
}

function scoreCpu(name: string) {
  const m = matchCpu(name);
  if (!m) throw new DeviceInputError(`unknown CPU "${name}" (not in the CPU tier list)`);
  return m.score;
}

/** Adds a preset or PC device; `isDefault` moves the default flag to it. The first device is always the default. */
export async function addDevice(db: Db, userId: string, input: AddDeviceInput): Promise<Device> {
  let row: typeof devices.$inferInsert;
  if (input.preset !== undefined) {
    const preset = getPreset(input.preset);
    if (!preset) {
      const ids = DEVICE_PRESETS.map((p) => p.id).join(', ');
      throw new DeviceInputError(`unknown preset "${input.preset}" (presets: ${ids}, or use pc)`);
    }
    const hw = preset.hardware;
    row = {
      userId,
      kind: preset.id,
      name: preset.name,
      platformIds: [...preset.platformIds],
      ...(hw && {
        gpuName: hw.gpuName,
        gpuScore: scoreGpu(hw.gpuName),
        cpuName: hw.cpuName,
        cpuScore: scoreCpu(hw.cpuName),
        ramGb: hw.ramGb,
      }),
    };
  } else {
    const { gpu, cpu, ramGb, name } = input.pc;
    if (!(ramGb > 0)) throw new DeviceInputError('RAM must be a positive number of GB');
    row = {
      userId,
      kind: 'pc',
      name: name ?? 'PC',
      platformIds: PC_PLATFORMS,
      gpuName: gpu,
      gpuScore: scoreGpu(gpu),
      cpuName: cpu,
      cpuScore: scoreCpu(cpu),
      ramGb,
    };
  }
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: devices.id })
      .from(devices)
      .where(eq(devices.userId, userId))
      .limit(1);
    const makeDefault = input.isDefault || !existing;
    // The partial unique index allows one default per user: clear the old one first.
    if (makeDefault) {
      await tx
        .update(devices)
        .set({ isDefault: false })
        .where(and(eq(devices.userId, userId), eq(devices.isDefault, true)));
    }
    const [created] = await tx
      .insert(devices)
      .values({ ...row, isDefault: makeDefault })
      .returning();
    return created!;
  });
}

/** The user's devices, default first, then oldest first. */
export async function listDevices(db: Db, userId: string): Promise<Device[]> {
  const rows = await db.select().from(devices).where(eq(devices.userId, userId));
  return rows.sort(
    (a, b) =>
      Number(b.isDefault) - Number(a.isDefault) || a.createdAt.getTime() - b.createdAt.getTime(),
  );
}

/** The short form of a device id shown by `device list`; any unique prefix resolves back to it. */
export function shortDeviceId(id: string): string {
  return id.slice(0, 8);
}

/** Removes the user's device by full id or unique id prefix (like a git short hash). */
export async function removeDevice(db: Db, userId: string, idOrPrefix: string): Promise<void> {
  const prefix = idOrPrefix.toLowerCase();
  const matches = (await listDevices(db, userId)).filter((d) => d.id.startsWith(prefix));
  if (matches.length === 0 || !prefix) throw new DeviceNotFoundError(`no device ${idOrPrefix}`);
  if (matches.length > 1) {
    const ids = matches.map((d) => d.id).join(', ');
    throw new Error(`device id "${idOrPrefix}" is ambiguous (${ids}); use more characters`);
  }
  await deleteDevice(db, userId, matches[0]!.id);
}

/**
 * Picks the devices to filter by: undefined or 'all' = every device, 'none' = no filtering,
 * otherwise a device id or a preset id (e.g. 'steam-deck').
 */
export function selectDevices<T extends Pick<FilterDevice, 'id' | 'kind'>>(
  all: readonly T[],
  spec: string | undefined,
): T[] {
  if (spec === undefined || spec === 'all') return [...all];
  if (spec === 'none') return [];
  const picked = all.filter((d) => d.id === spec || d.kind === spec);
  if (picked.length === 0)
    throw new DeviceNotFoundError(`no device matches "${spec}" (see: perch device list)`);
  return picked;
}

export interface DevicePatch {
  name?: string;
  isDefault?: boolean;
  /** PC devices only. */
  gpu?: string;
  cpu?: string;
  ramGb?: number;
}

/** Updates the user's device by full id; returns null when it is not theirs. */
export async function updateDevice(
  db: Db,
  userId: string,
  id: string,
  patch: DevicePatch,
): Promise<Device | null> {
  const set: Partial<typeof devices.$inferInsert> = {};
  if (patch.name !== undefined) set.name = patch.name;
  if (patch.isDefault !== undefined) set.isDefault = patch.isDefault;
  const hw = patch.gpu !== undefined || patch.cpu !== undefined || patch.ramGb !== undefined;
  return db.transaction(async (tx) => {
    const own = and(eq(devices.userId, userId), eq(devices.id, id));
    const [current] = await tx.select().from(devices).where(own);
    if (!current) return null;
    if (hw) {
      if (current.kind !== 'pc') throw new DeviceInputError('only PC hardware can be edited');
      if (patch.gpu !== undefined) {
        set.gpuName = patch.gpu;
        set.gpuScore = scoreGpu(patch.gpu);
      }
      if (patch.cpu !== undefined) {
        set.cpuName = patch.cpu;
        set.cpuScore = scoreCpu(patch.cpu);
      }
      if (patch.ramGb !== undefined) {
        if (!(patch.ramGb > 0)) throw new DeviceInputError('RAM must be a positive number of GB');
        set.ramGb = patch.ramGb;
      }
    }
    if (set.isDefault) {
      await tx
        .update(devices)
        .set({ isDefault: false })
        .where(and(eq(devices.userId, userId), eq(devices.isDefault, true)));
    }
    if (Object.keys(set).length === 0) return current;
    const [row] = await tx.update(devices).set(set).where(own).returning();
    return row ?? null;
  });
}

/** Deletes the user's device by full id; false when it is not theirs. Deleting the default promotes the oldest remaining device. */
export async function deleteDevice(db: Db, userId: string, id: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [gone] = await tx
      .delete(devices)
      .where(and(eq(devices.userId, userId), eq(devices.id, id)))
      .returning({ isDefault: devices.isDefault });
    if (!gone) return false;
    if (gone.isDefault) {
      const [next] = await tx
        .select({ id: devices.id })
        .from(devices)
        .where(eq(devices.userId, userId))
        .orderBy(asc(devices.createdAt), asc(devices.id))
        .limit(1);
      if (next) await tx.update(devices).set({ isDefault: true }).where(eq(devices.id, next.id));
    }
    return true;
  });
}
