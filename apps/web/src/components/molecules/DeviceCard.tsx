import type { ReactNode } from 'react';
import { Gamepad2, Laptop, Monitor, Star, Tv } from 'lucide-react';
import type { DeviceView } from '@perch/core';
import { Badge } from '../atoms';
import { cn } from '@/lib/cn';
import { deviceSummary, deviceType } from '@/lib/devices';

const ICON = { PC: Monitor, Mac: Laptop, Handheld: Gamepad2, Console: Tv } as const;

/** One device as a card: kind icon, name, specs, a marker when it is the default, and its actions. */
export function DeviceCard({ device, actions }: { device: DeviceView; actions: ReactNode }) {
  const type = deviceType(device.kind);
  const Icon = ICON[type];
  return (
    <li
      className={cn(
        'flex flex-col gap-4 rounded-lg border bg-surface-1 p-4 shadow-card transition-transform duration-base ease-out motion-safe:hover:-translate-y-1',
        device.isDefault ? 'border-accent' : 'border-line',
      )}
    >
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent">
          <Icon size={20} strokeWidth={1.75} aria-hidden />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="truncate font-title text-lg leading-tight text-fg">{device.name}</p>
          <div className="flex flex-wrap gap-1.5">
            <Badge>{type}</Badge>
            {device.isDefault && (
              <Badge tone="accent">
                <Star size={10} strokeWidth={2} aria-hidden />
                Default
              </Badge>
            )}
          </div>
        </div>
      </div>
      <p className="font-hud text-sm text-fg-muted">{deviceSummary(device)}</p>
      <div className="mt-auto flex flex-wrap items-center gap-1">{actions}</div>
    </li>
  );
}
