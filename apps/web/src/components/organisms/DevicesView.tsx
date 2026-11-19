import { useState } from 'react';
import { Pencil, Plus, Star, Trash2 } from 'lucide-react';
import type { DeviceView } from '@perch/core';
import { Button, Notice, Sheet, SheetContent, Skeleton } from '../atoms';
import { DeviceCard, LoadError } from '../molecules';
import { DeviceAdder } from './DeviceAdder';
import { PcDeviceForm } from './PcDeviceForm';
import { useDeleteDevice, useDevices, useUpdateDevice } from '@/hooks/queries';
import { canEditHardware } from '@/lib/devices';

const GRID = 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3';

type Panel = { kind: 'add' } | { kind: 'edit'; id: string };

export function DevicesView() {
  const devices = useDevices();
  const update = useUpdateDevice();
  const remove = useDeleteDevice();
  const [panel, setPanel] = useState<Panel | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const close = () => {
    setPanel(null);
    update.reset();
  };

  const list = devices.data ?? [];
  const editing = panel?.kind === 'edit' ? list.find((d) => d.id === panel.id) : undefined;

  function actionsFor(d: DeviceView) {
    if (confirmId === d.id) {
      return (
        <>
          <Button
            variant="danger"
            size="sm"
            loading={remove.isPending}
            onClick={() => remove.mutate(d.id, { onSettled: () => setConfirmId(null) })}
          >
            Delete
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setConfirmId(null)}>
            Keep
          </Button>
        </>
      );
    }
    return (
      <>
        {!d.isDefault && (
          <Button
            variant="ghost"
            size="sm"
            loading={update.isPending && update.variables?.id === d.id}
            onClick={() => update.mutate({ id: d.id, patch: { isDefault: true } })}
          >
            <Star size={14} strokeWidth={1.75} aria-hidden />
            Make default
          </Button>
        )}
        {canEditHardware(d) && (
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Edit ${d.name}`}
            onClick={() => setPanel({ kind: 'edit', id: d.id })}
          >
            <Pencil size={14} strokeWidth={1.75} aria-hidden />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Delete ${d.name}`}
          onClick={() => setConfirmId(d.id)}
        >
          <Trash2 size={14} strokeWidth={1.75} aria-hidden />
        </Button>
      </>
    );
  }

  return (
    <section className="flex w-full flex-col gap-6 px-gutter py-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-title text-3xl text-fg">Devices</h1>
          <p className="text-sm text-fg-muted">Picks are filtered to what each device can run.</p>
        </div>
        <Button variant="primary" onClick={() => setPanel({ kind: 'add' })}>
          <Plus size={14} strokeWidth={1.75} aria-hidden />
          Add device
        </Button>
      </div>

      {devices.isPending && (
        <div aria-busy className={GRID}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-36 rounded-lg" />
          ))}
        </div>
      )}
      {devices.isError && (
        <LoadError message={devices.error.message} onRetry={() => void devices.refetch()} />
      )}
      {remove.error && <Notice tone="error">{remove.error.message}</Notice>}
      {update.error && !editing && <Notice tone="error">{update.error.message}</Notice>}
      {devices.data?.length === 0 && (
        <Notice>No devices yet. Add one to see what runs on it.</Notice>
      )}
      {list.length > 0 && (
        <ul className={GRID}>
          {list.map((d) => (
            <DeviceCard key={d.id} device={d} actions={actionsFor(d)} />
          ))}
        </ul>
      )}

      <Sheet open={panel?.kind === 'add'} onOpenChange={(open) => !open && close()}>
        <SheetContent title="Add a device" description="Pick a console or describe your PC.">
          <div className="no-scrollbar overflow-y-auto">
            <DeviceAdder />
          </div>
        </SheetContent>
      </Sheet>
      <Sheet open={editing !== undefined} onOpenChange={(open) => !open && close()}>
        <SheetContent title={editing?.name ?? 'Edit device'} description="Edit your PC hardware.">
          {editing && (
            <PcDeviceForm
              key={editing.id}
              initial={{ gpu: editing.gpuName, cpu: editing.cpuName, ramGb: editing.ramGb }}
              submitLabel="Save"
              pending={update.isPending}
              error={update.error?.message ?? null}
              onSubmit={(hw) => update.mutate({ id: editing.id, patch: hw }, { onSuccess: close })}
              onCancel={close}
            />
          )}
        </SheetContent>
      </Sheet>
    </section>
  );
}
