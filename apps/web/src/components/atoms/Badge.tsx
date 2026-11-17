import type { ComponentProps, ReactNode } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { CircleAlert, CircleCheck, CircleHelp, CircleX, Gamepad2 } from 'lucide-react';
import type { DeckCategory, FitStatus } from '@perch/core';
import { cn } from '@/lib/cn';
import { deckDisplay, fitDisplay, type Tone } from '@/lib/fit';

export const badgeVariants = cva(
  'inline-flex h-5 shrink-0 items-center gap-1 whitespace-nowrap rounded-sm px-1.5 text-2xs font-medium',
  {
    variants: {
      tone: {
        neutral: 'border border-line bg-surface-2 text-fg-muted',
        accent: 'bg-accent-soft text-accent',
        yes: 'bg-fit-yes-soft text-fit-yes',
        low: 'bg-fit-low-soft text-fit-low',
        no: 'bg-fit-no-soft text-fit-no',
        unknown: 'bg-fit-unknown-soft text-fit-unknown',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export type BadgeProps = ComponentProps<'span'> & VariantProps<typeof badgeVariants>;

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

const TONE_ICON = {
  yes: CircleCheck,
  low: CircleAlert,
  no: CircleX,
  unknown: CircleHelp,
} satisfies Record<Tone, typeof CircleCheck>;

type StatusBadgeProps = { display: { label: string; tone: Tone }; lead?: ReactNode } & Omit<
  BadgeProps,
  'tone' | 'children'
>;

function StatusBadge({ display: { label, tone }, lead, ...props }: StatusBadgeProps) {
  const Icon = TONE_ICON[tone];
  return (
    <Badge tone={tone} {...props}>
      {lead}
      <Icon size={12} strokeWidth={1.75} aria-hidden />
      {label}
    </Badge>
  );
}

export function FitBadge({
  status,
  ...props
}: { status: FitStatus } & Omit<BadgeProps, 'tone' | 'children'>) {
  return <StatusBadge display={fitDisplay(status)} {...props} />;
}

export function DeckBadge({
  category,
  ...props
}: { category: DeckCategory } & Omit<BadgeProps, 'tone' | 'children'>) {
  return (
    <StatusBadge
      display={deckDisplay(category)}
      lead={
        <>
          <Gamepad2 size={12} strokeWidth={1.75} aria-hidden />
          <span className="sr-only">Deck: </span>
        </>
      }
      {...props}
    />
  );
}
