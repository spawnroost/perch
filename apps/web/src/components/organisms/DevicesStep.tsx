import { DeviceAdder } from './DeviceAdder';
import { useDevices } from '@/hooks/queries';

export function DevicesStep() {
  const devices = useDevices();
  return (
    <div className="flex flex-col gap-4">
      <DeviceAdder />
      <p className="text-sm text-fg-muted tabular-nums">
        {devices.data?.length ?? 0} added. Picks are filtered to what each device can run.
      </p>
    </div>
  );
}
