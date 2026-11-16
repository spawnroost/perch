import type { FitStatus } from '@perch/core';
import { FitBadge } from '../atoms';
import { fitReason } from '@/lib/fit';

export function FitDetailRow({ deviceName, status }: { deviceName: string; status: FitStatus }) {
  return (
    <li className="flex flex-col gap-1 border-b border-line px-3 py-2.5 last:border-b-0">
      <div className="flex items-center justify-between gap-3">
        <span className="text-base font-medium text-fg">{deviceName}</span>
        <FitBadge status={status} />
      </div>
      <p className="text-sm text-fg-muted">{fitReason(status)}</p>
    </li>
  );
}
