import { HudChip } from '../atoms';
import { fitChips, type DeviceFit } from '@/lib/forYou';
import { cn } from '@/lib/cn';

/** Per-device "will it run" HUD chips as a labelled list; renders nothing with no devices. */
export function FitChips({ fits, className }: { fits: readonly DeviceFit[]; className?: string }) {
  const chips = fitChips(fits);
  if (chips.length === 0) return null;
  return (
    <ul aria-label="Will it run" className={cn('flex flex-wrap gap-1.5', className)}>
      {chips.map((chip) => (
        <li key={chip.label}>
          <HudChip {...chip} />
        </li>
      ))}
    </ul>
  );
}
