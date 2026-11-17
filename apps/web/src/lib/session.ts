/** Quick session logic: which device and params a session query uses. */
import type { DeviceView, SessionQuery } from '@perch/core';

export const SESSION_MINUTES = [15, 30, 60, 120] as const;
export const DEFAULT_SESSION_MINUTES = 30;

/** Results shown in the sheet's cover grid. */
export const SESSION_RESULT_CAP = 12;

export const capSession = <T>(picks: readonly T[]): T[] => picks.slice(0, SESSION_RESULT_CAP);

/** The device the user picked; no default, so undefined until they pick (or if it was removed). */
export function sessionDevice(
  devices: readonly DeviceView[],
  pickedId: string | undefined,
): DeviceView | undefined {
  return pickedId === undefined ? undefined : devices.find((d) => d.id === pickedId);
}

/** Shelf title for the session a query asked for (not the controls' current minutes). */
export const sessionTitle = (query: SessionQuery, deviceName: string): string =>
  `Fits ${query.minutes} min on ${deviceName}`;

/** Query for `/api/session`. Battery stays an optional API param with no UI. Null without a device. */
export function sessionParams({
  minutes,
  device,
}: {
  minutes: number;
  device: DeviceView | undefined;
}): SessionQuery | null {
  return device ? { minutes, deviceId: device.id } : null;
}
