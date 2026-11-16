import type { ComponentProps, ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { cva } from 'class-variance-authority';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';

export const Sheet = Dialog.Root;
export const SheetTrigger = Dialog.Trigger;
export const SheetClose = Dialog.Close;

const panelVariants = cva(
  'fixed z-50 flex flex-col gap-3 bg-surface-1 p-4 shadow-overlay outline-none',
  {
    variants: {
      side: {
        right:
          'inset-y-0 right-0 w-full max-w-md border-l border-line data-[state=open]:animate-sheet-in-right data-[state=closed]:animate-sheet-out-right',
        bottom:
          'inset-x-0 bottom-0 max-h-4/5 rounded-t-xl border-t border-line data-[state=open]:animate-sheet-in-bottom data-[state=closed]:animate-sheet-out-bottom',
      },
    },
    defaultVariants: { side: 'right' },
  },
);

export interface SheetContentProps extends Omit<
  ComponentProps<typeof Dialog.Content>,
  'title' | 'children'
> {
  side?: 'right' | 'bottom';
  title: string;
  description: string;
  children?: ReactNode;
}

export function SheetContent({
  side = 'right',
  title,
  description,
  className,
  children,
  ...props
}: SheetContentProps) {
  return (
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-scrim data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out" />
      <Dialog.Content className={cn(panelVariants({ side }), className)} {...props}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <Dialog.Title className="text-lg font-semibold tracking-tight text-fg">
              {title}
            </Dialog.Title>
            <Dialog.Description className="text-sm text-fg-muted">{description}</Dialog.Description>
          </div>
          <Dialog.Close
            aria-label="Close"
            className="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-sm text-fg-muted transition-colors duration-fast ease-out hover:bg-surface-2 hover:text-fg"
          >
            <X size={16} strokeWidth={1.75} aria-hidden />
          </Dialog.Close>
        </div>
        {children}
      </Dialog.Content>
    </Dialog.Portal>
  );
}
