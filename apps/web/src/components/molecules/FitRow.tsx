import { FitBadge } from '../atoms';
import type { DeviceFit } from '@/lib/forYou';

/** The signature per-device fit row: one compact chip per device. */
export function FitRow({ fits }: { fits: readonly DeviceFit[] }) {
  if (fits.length === 0) return null;
  return (
    <ul aria-label="Will it run" className="flex flex-wrap gap-x-3 gap-y-1">
      {fits.map((f) => (
        <li
          key={f.deviceId}
          title={f.reason}
          className="flex items-center gap-1.5 text-xs text-fg-subtle"
        >
          {f.deviceName}
          <FitBadge status={f.status} />
        </li>
      ))}
    </ul>
  );
}
