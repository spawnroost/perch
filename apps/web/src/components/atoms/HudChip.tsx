import type { ComponentProps } from 'react';
import { cva } from 'class-variance-authority';
import { TONE_ICON } from '@/components/atoms/Badge';
import { cn } from '@/lib/cn';
import type { Tone } from '@/lib/fit';

const chipVariants = cva(
  'inline-flex h-5 shrink-0 items-center gap-1 whitespace-nowrap rounded-sm border border-current/20 px-1.5 text-2xs',
  {
    variants: {
      tone: {
        yes: 'bg-fit-yes-soft text-fit-yes',
        low: 'bg-fit-low-soft text-fit-low',
        no: 'bg-fit-no-soft text-fit-no',
        unknown: 'bg-fit-unknown-soft text-fit-unknown',
      },
    },
    defaultVariants: { tone: 'unknown' },
  },
);

const TONE_TEXT: Record<Tone, string> = {
  yes: 'runs well',
  low: 'runs on low',
  no: "won't run",
  unknown: 'unknown',
};

export type HudChipProps = { label: string; tone: Tone } & Omit<ComponentProps<'span'>, 'children'>;

/** Small HUD-style device-fit chip: device label plus a tone icon, never colour alone. */
export function HudChip({ label, tone, className, ...props }: HudChipProps) {
  const Icon = TONE_ICON[tone];
  return (
    <span className={cn('font-hud', chipVariants({ tone }), className)} {...props}>
      <Icon size={12} strokeWidth={2} aria-hidden />
      {label}
      <span className="sr-only">: {TONE_TEXT[tone]}</span>
    </span>
  );
}
