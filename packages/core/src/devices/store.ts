import { and, eq } from 'drizzle-orm';
import { devices, type Db } from '@perch/db';
import { matchCpu, matchGpu } from '../hardware/tiers.js';
import type { FilterDevice } from '../engine/filters.js';
import { DEVICE_PRESETS, getPreset, IGDB_PLATFORM } from './presets.js';

export type Device = typeof devices.$inferSelect;

export type AddDeviceInput = { isDefault?: boolean } & (
  | { preset: string; pc?: undefined }
  | { pc: { gpu: string; cpu: string; ramGb: number; name?: string }; preset?: undefined }
);

/** IGDB platforms a custom PC plays. */
const PC_PLATFORMS = [IGDB_PLATFORM.windows, IGDB_PLATFORM.linux];

function scoreGpu(name: string) {
  const m = matchGpu(name);
  if (!m) throw new Error(`unknown GPU "${name}" (not in the GPU tier list)`);
  return m.score;
}

function scoreCpu(name: string) {
  const m = matchCpu(name);
  if (!m) throw new Error(`unknown CPU "${name}" (not in the CPU tier list)`);
  return m.score;
}

/** Adds a preset or PC device; `isDefault` moves the user's default flag to it. */
export async function addDevice(db: Db, userId: string, input: AddDeviceInput): Promise<Device> {
  let row: typeof devices.$inferInsert;
  if (input.preset !== undefined) {
    const preset = getPreset(input.preset);
    if (!preset) {
      const ids = DEVICE_PRESETS.map((p) => p.id).join(', ');
      throw new Error(`unknown preset "${input.preset}" (presets: ${ids}, or use pc)`);
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
    if (!(ramGb > 0)) throw new Error('RAM must be a positive number of GB');
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
    // The partial unique index allows one default per user: clear the old one first.
    if (input.isDefault) {
      await tx
        .update(devices)
        .set({ isDefault: false })
        .where(and(eq(devices.userId, userId), eq(devices.isDefault, true)));
    }
    const [created] = await tx
      .insert(devices)
      .values({ ...row, isDefault: input.isDefault ?? false })
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

export async function removeDevice(db: Db, userId: string, id: string): Promise<void> {
  const gone = await db
    .delete(devices)
    .where(and(eq(devices.userId, userId), eq(devices.id, id)))
    .returning({ id: devices.id });
  if (gone.length === 0) throw new Error(`no device ${id}`);
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
  if (picked.length === 0) throw new Error(`no device matches "${spec}" (see: perch device list)`);
  return picked;
}
