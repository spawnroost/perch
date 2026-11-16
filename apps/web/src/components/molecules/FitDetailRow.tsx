import { FitBadge } from '../atoms';
import type { DeviceFit } from '@/lib/forYou';

export function FitDetailRow({ deviceName, status, reason }: Omit<DeviceFit, 'deviceId'>) {
  return (
    <li className="flex flex-col gap-1 border-b border-line px-3 py-2.5 last:border-b-0">
      <div className="flex items-center justify-between gap-3">
        <span className="text-base font-medium text-fg">{deviceName}</span>
        <FitBadge status={status} />
      </div>
      <p className="text-sm text-fg-muted">{reason}</p>
    </li>
  );
}
