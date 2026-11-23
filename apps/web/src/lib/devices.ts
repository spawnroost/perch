/** Device list logic: labels and spec summary. */
import type { DeviceView } from '@perch/core';
import { platformNames } from './platforms';

const HANDHELDS = new Set([
  'steam-deck',
  'rog-ally',
  'switch',
  'switch-2',
  'iphone',
  'ipad',
  'android-phone',
  'android-tablet',
]);

export type DeviceType = 'PC' | 'Mac' | 'Handheld' | 'Console';

export function deviceType(kind: string): DeviceType {
  if (kind === 'pc') return 'PC';
  if (kind === 'mac') return 'Mac';
  return HANDHELDS.has(kind) ? 'Handheld' : 'Console';
}

/** Which illustration a device gets: finer than DeviceType (a Switch and a Steam Deck are both handhelds, but look different). */
export type DeviceArtType =
  'desktop' | 'laptop' | 'handheld' | 'hybrid' | 'console-slab' | 'console-box' | 'generic';

export const DEVICE_ART_TYPES: readonly DeviceArtType[] = [
  'desktop',
  'laptop',
  'handheld',
  'hybrid',
  'console-slab',
  'console-box',
  'generic',
];

const ART_BY_KIND: Record<string, DeviceArtType> = {
  pc: 'desktop',
  mac: 'laptop',
  'steam-deck': 'handheld',
  'rog-ally': 'handheld',
  // Placeholder until the mobile art (M5).
  iphone: 'handheld',
  ipad: 'handheld',
  'android-phone': 'handheld',
  'android-tablet': 'handheld',
  switch: 'hybrid',
  'switch-2': 'hybrid',
  ps5: 'console-slab',
  ps4: 'console-slab',
  'xbox-series': 'console-box',
};

/** Illustration for a device kind; unknown kinds get a plain gamepad. */
export function deviceArtType(kind: string): DeviceArtType {
  return Object.hasOwn(ART_BY_KIND, kind) ? ART_BY_KIND[kind]! : 'generic';
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

/** A Steam Deck device's fit chip already says whether the Deck runs a game. */
export const hasDeckDevice = (devices: readonly DeviceView[]) =>
  devices.some((d) => d.kind === 'steam-deck');
