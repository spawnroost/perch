import { FitBadge } from '../atoms';
import type { FitChip } from '@/lib/forYou';

/** The signature per-device fit row: one compact chip per device. */
export function FitRow({ chips }: { chips: readonly FitChip[] }) {
  if (chips.length === 0) return null;
  return (
    <ul aria-label="Will it run" className="flex flex-wrap gap-x-3 gap-y-1">
      {chips.map((c) => (
        <li key={c.deviceId} className="flex items-center gap-1.5 text-xs text-fg-subtle">
          {c.deviceName}
          <FitBadge status={c.status} />
        </li>
      ))}
    </ul>
  );
}
