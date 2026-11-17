import { Check } from 'lucide-react';
import { Card, DEVICE_BANNER, DeviceArt } from '../atoms';
import { cn } from '@/lib/cn';
import { deviceArtType, deviceType } from '@/lib/devices';

export interface DevicePresetCardProps {
  name: string;
  /** Device kind (preset id, or 'pc'): picks the illustration. */
  kind: string;
  added: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

export function DevicePresetCard({ name, kind, added, disabled, onSelect }: DevicePresetCardProps) {
  return (
    <Card
      interactive
      pressed={added}
      disabled={disabled}
      onClick={onSelect}
      className="flex flex-col gap-2 overflow-hidden p-0 text-sm text-fg disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span
        aria-hidden
        className={cn(
          'flex h-20 w-full items-center justify-center bg-linear-to-br',
          DEVICE_BANNER[deviceType(kind)],
        )}
      >
        <DeviceArt type={deviceArtType(kind)} className="h-full py-1.5" />
      </span>
      <span className="flex items-center gap-2 px-3 pb-2.5">
        <span className="flex-1">{name}</span>
        {added && <Check size={14} strokeWidth={1.75} className="text-accent" aria-label="Added" />}
      </span>
    </Card>
  );
}
