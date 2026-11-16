import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import { Card } from '../atoms';

export interface DevicePresetCardProps {
  name: string;
  icon?: ReactNode;
  added: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

export function DevicePresetCard({ name, icon, added, disabled, onSelect }: DevicePresetCardProps) {
  return (
    <Card
      interactive
      pressed={added}
      disabled={disabled}
      onClick={onSelect}
      className="flex items-center gap-2 px-3 py-2.5 text-sm text-fg disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span className="flex text-fg-muted" aria-hidden>
        {icon}
      </span>
      <span className="flex-1">{name}</span>
      {added && <Check size={14} strokeWidth={1.75} className="text-coral" aria-label="Added" />}
    </Card>
  );
}
