import type { ReactNode } from 'react';
import { Gamepad2, Laptop, Monitor, Tv } from 'lucide-react';
import type { DeviceView } from '@perch/core';
import { Badge } from '../atoms';
import { deviceSummary, deviceType } from '@/lib/devices';

const ICON = { PC: Monitor, Mac: Laptop, Handheld: Gamepad2, Console: Tv } as const;

export function DeviceRow({ device, actions }: { device: DeviceView; actions: ReactNode }) {
  const type = deviceType(device.kind);
  const Icon = ICON[type];
  return (
    <li className="flex items-center gap-3 border-b border-line px-3 py-2.5 last:border-b-0">
      <Icon size={16} strokeWidth={1.75} className="shrink-0 text-fg-muted" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-base font-medium text-fg">
          <span className="truncate">{device.name}</span>
          <Badge>{type}</Badge>
          {device.isDefault && <Badge tone="coral">Default</Badge>}
        </p>
        <p className="truncate text-sm text-fg-muted">{deviceSummary(device)}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1">{actions}</div>
    </li>
  );
}
