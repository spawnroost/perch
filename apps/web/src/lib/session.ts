/** Quick session logic: which device and params a session query uses. */
import type { DeviceView, SessionQuery } from '@perch/core';
import { isHandheldKind } from '@perch/core/session';

export const SESSION_MINUTES = [15, 30, 60, 120] as const;
export const DEFAULT_SESSION_MINUTES = 30;

/** The picked device; on All (or a removed pick) the default device, else the first one. */
export function sessionDevice(
  devices: readonly DeviceView[],
  pickedId: string,
): DeviceView | undefined {
  return devices.find((d) => d.id === pickedId) ?? devices.find((d) => d.isDefault) ?? devices[0];
}

/** Battery only matters on handheld kinds, so the slider is hidden elsewhere. */
export const showBattery = (device: DeviceView | undefined): boolean =>
  device !== undefined && isHandheldKind(device.kind);

/** A Battery API level (0-1) as a whole percent; undefined when it is not a number. */
export function batteryPercent(level: number): number | undefined {
  return Number.isFinite(level) ? Math.round(Math.min(1, Math.max(0, level)) * 100) : undefined;
}

type BatteryNav = { getBattery?: () => Promise<{ level: number }> };

/** Current battery percent from `navigator.getBattery()`; undefined when unsupported or denied. */
export async function readBatteryPercent(nav: object): Promise<number | undefined> {
  try {
    const battery = await (nav as BatteryNav).getBattery?.();
    return battery ? batteryPercent(battery.level) : undefined;
  } catch {
    return undefined;
  }
}

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
