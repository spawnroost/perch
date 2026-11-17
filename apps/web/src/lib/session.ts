/** Quick session logic: which device and params a session query uses. */
import type { DeviceView, SessionQuery } from '@perch/core';
import { isBatteryAwareKind } from '@perch/core/session';

export const SESSION_MINUTES = [15, 30, 60, 120] as const;
export const DEFAULT_SESSION_MINUTES = 30;

/** The picked device; on All (or a removed pick) the default device, else the first one. */
export function sessionDevice(
  devices: readonly DeviceView[],
  pickedId: string,
): DeviceView | undefined {
  return devices.find((d) => d.id === pickedId) ?? devices.find((d) => d.isDefault) ?? devices[0];
}

/** Battery only matters on battery-aware kinds, so the slider is hidden elsewhere. */
export const showBattery = (device: DeviceView | undefined): boolean =>
  device !== undefined && isBatteryAwareKind(device.kind);

/** A Battery API level (0-1) as a whole percent; undefined when it is not a number. */
export function batteryPercent(level: number): number | undefined {
  return Number.isFinite(level) ? Math.round(Math.min(1, Math.max(0, level)) * 100) : undefined;
}

type BatteryNav = { getBattery?: () => Promise<{ level: number }> };

export const BATTERY_READ_TIMEOUT_MS = 800;

/**
 * Current battery percent from `navigator.getBattery()`; undefined when unsupported, denied, or
 * not settled within `timeoutMs` (the promise can hang).
 */
export async function readBatteryPercent(
  nav: object,
  timeoutMs = BATTERY_READ_TIMEOUT_MS,
): Promise<number | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), timeoutMs);
  });
  try {
    const read = (async () => {
      const battery = await (nav as BatteryNav).getBattery?.();
      return battery ? batteryPercent(battery.level) : undefined;
    })();
    return await Promise.race([read, timeout]);
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

/** Shelf title for the session a query asked for (not the controls' current minutes). */
export const sessionTitle = (query: SessionQuery, deviceName: string): string =>
  `Fits ${query.minutes} min on ${deviceName}`;

/** Query for `/api/session`; battery is sent only for a handheld. Null without a device. */
export function sessionParams({
  minutes,
  battery,
  device,
}: {
  minutes: number;
  battery?: number;
  device: DeviceView | undefined;
}): SessionQuery | null {
  if (!device) return null;
  return {
    minutes,
    ...(showBattery(device) && battery !== undefined ? { battery } : {}),
    deviceId: device.id,
  };
}
