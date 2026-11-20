import { cn } from '@/lib/cn';

const DELAYS = ['0ms', '300ms', '150ms'] as const;

/** Three bouncing bars for "playing". Static (full height) when the user prefers reduced motion. */
export function EqualizerBars({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn('flex h-3.5 items-end gap-0.5', className)}>
      {DELAYS.map((delay) => (
        <span
          key={delay}
          style={{ animationDelay: delay }}
          className="h-full w-0.5 origin-bottom animate-eq rounded-full bg-accent motion-reduce:animate-none"
        />
      ))}
    </span>
  );
}
