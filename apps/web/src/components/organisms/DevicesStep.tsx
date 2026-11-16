import { useState } from 'react';
import { Gamepad2, Laptop, Monitor, Tv } from 'lucide-react';
import { Notice, Skeleton } from '../atoms';
import { DevicePresetCard } from '../molecules';
import { PcDeviceForm } from './PcDeviceForm';
import { useAddDevice, useDevicePresets, useDevices } from '@/hooks/queries';

const HANDHELDS = new Set(['steam-deck', 'rog-ally', 'switch', 'switch-2']);
const iconFor = (id: string) =>
  id === 'mac' ? (
    <Laptop size={16} />
  ) : HANDHELDS.has(id) ? (
    <Gamepad2 size={16} />
  ) : (
    <Tv size={16} />
  );

export function DevicesStep() {
  const presets = useDevicePresets();
  const devices = useDevices();
  const add = useAddDevice();
  const [pcOpen, setPcOpen] = useState(false);

  const kinds = new Set(devices.data?.map((d) => d.kind));
  const busy = add.isPending;

  return (
    <div className="flex flex-col gap-4">
      {presets.isError && <Notice tone="error">{presets.error.message}</Notice>}
      {add.error && !pcOpen && <Notice tone="error">{add.error.message}</Notice>}
      {presets.isPending ? (
        <Skeleton className="h-24" />
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <DevicePresetCard
            name="Gaming PC"
            icon={<Monitor size={16} />}
            added={kinds.has('pc')}
            disabled={busy}
            onSelect={() => setPcOpen(true)}
          />
          {presets.data?.map((p) => (
            <DevicePresetCard
              key={p.id}
              name={p.name}
              icon={iconFor(p.id)}
              added={kinds.has(p.id)}
              disabled={busy || kinds.has(p.id)}
              onSelect={() => add.mutate({ preset: p.id })}
            />
          ))}
        </div>
      )}
      {pcOpen && <PcDeviceForm onDone={() => setPcOpen(false)} onCancel={() => setPcOpen(false)} />}
      <p className="text-sm text-fg-muted tabular-nums">
        {devices.data?.length ?? 0} added. Picks are filtered to what each device can run.
      </p>
    </div>
  );
}
