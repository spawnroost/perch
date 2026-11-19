import { Check } from 'lucide-react';
import { cn } from '@/lib/cn';
import { STEPS, stepIndex, type Step } from '@/lib/onboarding';

const LABELS: Record<Step, string> = {
  games: 'Games',
  devices: 'Devices',
  picks: 'First picks',
};

export function StepIndicator({ current }: { current: Step }) {
  const active = stepIndex(current);
  return (
    <ol className="flex items-center gap-3 sm:gap-4" aria-label="Onboarding progress">
      {STEPS.map((step, i) => (
        <li
          key={step}
          aria-current={i === active ? 'step' : undefined}
          className={cn(
            'flex items-center gap-2 whitespace-nowrap text-sm',
            i === active ? 'text-fg' : 'text-fg-subtle',
          )}
        >
          <span
            className={cn(
              'flex size-5 items-center justify-center rounded-sm text-2xs font-medium tabular-nums',
              i === active && 'bg-accent text-on-accent',
              i < active && 'bg-accent-soft text-accent',
              i > active && 'border border-line',
            )}
          >
            {i < active ? <Check size={12} strokeWidth={2} aria-hidden /> : i + 1}
          </span>
          {LABELS[step]}
        </li>
      ))}
    </ol>
  );
}
