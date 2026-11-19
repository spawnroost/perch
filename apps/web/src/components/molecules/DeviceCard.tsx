import type { ReactNode } from 'react';
import { Star } from 'lucide-react';
import type { DeviceView } from '@perch/core';
import { Badge, DEVICE_BANNER, DeviceArt, useArtParallax } from '../atoms';
import { cn } from '@/lib/cn';
import { deviceArtType, deviceSummary, deviceType } from '@/lib/devices';

/** One device as a card: a gradient banner for its kind, name, specs, a Default badge, and its actions. */
export function DeviceCard({ device, actions }: { device: DeviceView; actions: ReactNode }) {
  const type = deviceType(device.kind);
  const parallax = useArtParallax();
  return (
    <li
      className={cn(
        'flex flex-col overflow-hidden rounded-lg border bg-surface-1 shadow-card transition-transform duration-base ease-out motion-safe:hover:-translate-y-1',
        device.isDefault ? 'border-accent' : 'border-line',
      )}
    >
      <div
        aria-hidden
        {...parallax.handlers}
        className={cn(
          'relative flex h-30 items-center justify-end overflow-hidden bg-linear-to-br pr-3',
          DEVICE_BANNER[type],
        )}
      >
        {/* Kind watermark fills the banner's left side opposite the art. */}
        <span className="pointer-events-none absolute bottom-1 left-3 font-hud text-5xl leading-none text-fg/10 select-none">
          {type}
        </span>
        <DeviceArt
          type={deviceArtType(device.kind)}
          style={parallax.style}
          className="h-full shrink-0 py-2"
        />
        {device.isDefault && (
          <Badge tone="accent" className="absolute top-3 left-3 bg-ground/80">
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
