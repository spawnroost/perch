import { useDevices } from './queries';
import { ALL_TAB } from '@/lib/forYou';

/**
 * Settles which device a page's grid is for. Anything that is not one of the user's devices
 * means All. `resolved` is false until that is known: only a device other than All has to wait
 * for the device list (to check it still exists).
 */
export function useResolvedDevice(device: string) {
  const devices = useDevices();
  const resolved = device === ALL_TAB || devices.isSuccess;
  const deviceId = devices.data?.some((d) => d.id === device) ? device : ALL_TAB;
  return { devices, resolved, deviceId };
}
