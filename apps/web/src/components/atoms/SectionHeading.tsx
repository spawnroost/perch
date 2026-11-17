import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

/** Uppercase tracked section title: shelf titles and the sections of the game detail. */
export function SectionHeading({ className, ...props }: ComponentProps<'h2'>) {
  return <h2 className={cn('font-hud text-sm text-fg', className)} {...props} />;
}
