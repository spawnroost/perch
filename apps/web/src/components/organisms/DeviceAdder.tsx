import { useState } from 'react';
import { Notice, Skeleton } from '../atoms';
import { DevicePresetCard } from '../molecules';
import { PcDeviceForm } from './PcDeviceForm';
import { useAddDevice, useDevicePresets, useDevices } from '@/hooks/queries';
import { addedKinds } from '@/lib/devices';

/** Presets plus the PC form. Used by onboarding and the Devices page. */
export function DeviceAdder() {
  const presets = useDevicePresets();
  const devices = useDevices();
  const add = useAddDevice();
  const [pcOpen, setPcOpen] = useState(false);

  const kinds = addedKinds(devices.data ?? []);
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
            kind="pc"
            added={kinds.has('pc')}
            disabled={busy}
            onSelect={() => setPcOpen(true)}
          />
          {presets.data?.map((p) => (
            <DevicePresetCard
              key={p.id}
              name={p.name}
              kind={p.id}
              added={kinds.has(p.id)}
              disabled={busy || kinds.has(p.id)}
              onSelect={() => add.mutate({ preset: p.id })}
            />
          ))}
        </div>
      )}
      {pcOpen && (
        <PcDeviceForm
          submitLabel="Add PC"
          pending={add.isPending}
          error={add.error?.message ?? null}
          onSubmit={(pc) => add.mutate({ pc }, { onSuccess: () => setPcOpen(false) })}
          onCancel={() => setPcOpen(false)}
        />
      )}
    </div>
  );
}
