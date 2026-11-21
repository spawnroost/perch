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
        /** Centred dialog for focused moments (the roulette). */
        center:
          'inset-x-4 top-1/2 mx-auto max-h-[calc(100dvh-2rem)] max-w-lg -translate-y-1/2 overflow-y-auto rounded-2xl border border-line data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out',
        /** Command palette: full screen on mobile, a centred panel from `sm`. Brings its own header and close. */
        palette:
          'inset-0 gap-0 p-0 sm:inset-x-0 sm:top-24 sm:bottom-auto sm:mx-auto sm:max-h-[calc(100dvh-8rem)] sm:w-full sm:max-w-xl sm:rounded-xl sm:border sm:border-line data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out',
      },
    },
    defaultVariants: { side: 'right' },
  },
);

export interface SheetContentProps extends Omit<
  ComponentProps<typeof Dialog.Content>,
  'title' | 'children'
> {
  side?: 'right' | 'bottom' | 'center' | 'palette';
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
  const palette = side === 'palette';
  return (
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-scrim data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out" />
      <Dialog.Content className={cn(panelVariants({ side }), className)} {...props}>
        <div className={cn('flex items-start justify-between gap-3', palette && 'sr-only')}>
          <div className="flex flex-col gap-0.5">
            <Dialog.Title className="text-lg font-semibold tracking-tight text-fg">
              {title}
            </Dialog.Title>
            <Dialog.Description className="text-sm text-fg-muted">{description}</Dialog.Description>
          </div>
          {!palette && (
            <Dialog.Close
              aria-label="Close"
              className="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-sm text-fg-muted transition-colors duration-fast ease-out hover:bg-surface-2 hover:text-fg"
            >
              <X size={16} strokeWidth={1.75} aria-hidden />
            </Dialog.Close>
          )}
        </div>
        {children}
      </Dialog.Content>
    </Dialog.Portal>
  );
}
