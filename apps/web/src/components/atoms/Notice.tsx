import type { ComponentProps } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/cn';

export const noticeVariants = cva('rounded-md px-3 py-2 text-sm', {
  variants: {
    tone: {
      error: 'bg-fit-no-soft text-fit-no',
      success: 'bg-fit-yes-soft text-fit-yes',
      info: 'border border-line bg-surface-2 text-fg-muted',
    },
  },
  defaultVariants: { tone: 'info' },
});

export type NoticeProps = ComponentProps<'p'> & VariantProps<typeof noticeVariants>;

export function Notice({ className, tone, role, ...props }: NoticeProps) {
  return (
    <p
      role={role ?? (tone === 'error' ? 'alert' : 'status')}
      className={cn(noticeVariants({ tone }), className)}
      {...props}
    />
  );
}
