import type { ReactNode } from 'react';
import { Gamepad2, Laptop, Monitor, Star, Tv } from 'lucide-react';
import type { DeviceView } from '@perch/core';
import { Badge } from '../atoms';
import { cn } from '@/lib/cn';
import { deviceSummary, deviceType, type DeviceType } from '@/lib/devices';

const ICON = { PC: Monitor, Mac: Laptop, Handheld: Gamepad2, Console: Tv } as const;

/** Banner gradient per device type; the colours are tokens (device-*). */
const BANNER: Record<DeviceType, string> = {
  PC: 'from-device-pc to-device-pc-end',
  Mac: 'from-device-mac to-device-mac-end',
  Handheld: 'from-device-handheld to-device-handheld-end',
  Console: 'from-device-console to-device-console-end',
};

/** One device as a card: a gradient banner for its kind, name, specs, a Default badge, and its actions. */
export function DeviceCard({ device, actions }: { device: DeviceView; actions: ReactNode }) {
  const type = deviceType(device.kind);
  const Icon = ICON[type];
  return (
    <li
      className={cn(
        'flex flex-col overflow-hidden rounded-lg border bg-surface-1 shadow-card transition-transform duration-base ease-out motion-safe:hover:-translate-y-1',
        device.isDefault ? 'border-accent' : 'border-line',
      )}
    >
      <div
        aria-hidden
        className={cn(
          'relative flex h-24 items-end justify-between bg-linear-to-br p-4',
          BANNER[type],
        )}
      >
        <Icon size={40} strokeWidth={1.25} className="text-fg/80" />
        {device.isDefault && (
          <Badge tone="accent" className="absolute top-3 right-3 bg-ground/80">
            <Star size={10} strokeWidth={2} aria-hidden />
            Default
          </Badge>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex flex-col gap-1">
          <p className="flex items-baseline gap-2">
            <span className="truncate font-title text-lg leading-tight text-fg">{device.name}</span>
            <span className="shrink-0 text-2xs text-fg-subtle">{type}</span>
          </p>
          {device.isDefault && <span className="sr-only">Default device</span>}
          <p className="text-sm text-balance text-fg-muted">{deviceSummary(device)}</p>
        </div>
        <div className="mt-auto flex flex-wrap items-center gap-1">{actions}</div>
      </div>
    </li>
  );
}
