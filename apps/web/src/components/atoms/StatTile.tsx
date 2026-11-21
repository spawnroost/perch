import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/** A label over a big value: one stat on the taste card. */
export function StatTile({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-0.5', className)}>
      <span className="font-hud text-2xs text-fg-subtle">{label}</span>
      <span className="font-title text-2xl text-fg lg:text-display-sm tabular-nums">
        {children}
      </span>
    </div>
  );
}
