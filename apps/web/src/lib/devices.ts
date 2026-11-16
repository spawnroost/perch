/** Device list logic: labels, spec summary and default handling. */
import type { DeviceView } from '@perch/core';
import { platformNames } from './platforms';

const HANDHELDS = new Set(['steam-deck', 'rog-ally', 'switch', 'switch-2']);

export type DeviceType = 'PC' | 'Mac' | 'Handheld' | 'Console';

export function deviceType(kind: string): DeviceType {
  if (kind === 'pc') return 'PC';
  if (kind === 'mac') return 'Mac';
  return HANDHELDS.has(kind) ? 'Handheld' : 'Console';
}

/** Only PC hardware can be edited; presets have fixed specs. */
export const canEditHardware = (d: DeviceView) => d.kind === 'pc';

/** "RTX 3060 · Ryzen 5 5600 · 16 GB", or the platform names when the device has no hardware. */
export function deviceSummary(d: DeviceView): string {
  const specs = [d.gpuName, d.cpuName, d.ramGb === null ? null : `${d.ramGb} GB`].filter(
    (s): s is string => s !== null,
  );
  return specs.length > 0 ? specs.join(' · ') : platformNames(d.platformIds).join(', ');
}

export const addedKinds = (devices: DeviceView[]) => new Set(devices.map((d) => d.kind));

/** A new device becomes the default when none is flagged yet. */
export const needsDefault = (devices: DeviceView[]) => !devices.some((d) => d.isDefault);

/** The device to promote when `removedId` is deleted: the oldest other one, only if it was the default. */
export function successorDefault(devices: DeviceView[], removedId: string): string | null {
  if (!devices.some((d) => d.id === removedId && d.isDefault)) return null;
  const rest = devices
    .filter((d) => d.id !== removedId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return rest[0]?.id ?? null;
}
