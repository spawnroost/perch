import type { FitStatus } from '@perch/core';
import { FitBadge } from '../atoms';

export interface PickRowProps {
  rank: number;
  name: string;
  reason: string;
  fit?: FitStatus;
}

export function PickRow({ rank, name, reason, fit }: PickRowProps) {
  return (
    <li className="flex items-center gap-3 border-b border-line px-3 py-2.5 last:border-b-0">
      <span className="w-5 text-sm text-fg-subtle tabular-nums">{rank}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-medium text-fg">{name}</p>
        <p className="truncate text-sm text-fg-muted">{reason}</p>
      </div>
      {fit && <FitBadge status={fit} />}
    </li>
  );
}
