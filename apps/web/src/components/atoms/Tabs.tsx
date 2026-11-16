import type { ComponentProps } from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cn } from '@/lib/cn';

export const Tabs = TabsPrimitive.Root;

export function TabsList({ className, ...props }: ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn(
        'inline-flex h-8 items-center gap-0.5 rounded-md border border-line bg-surface-1 p-0.5',
        className,
      )}
      {...props}
    />
  );
}

export function TabsTrigger({ className, ...props }: ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'inline-flex h-6 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-sm px-2.5 text-sm font-medium text-fg-muted transition-colors duration-fast ease-out hover:text-fg disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-surface-3 data-[state=active]:text-fg',
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }: ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn('mt-3', className)} {...props} />;
}
