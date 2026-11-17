import type { ComponentProps } from 'react';
import { Gamepad2 } from 'lucide-react';
import { cn } from '@/lib/cn';

export type CoverProps = {
  src: string | null;
  alt: string;
  srcSet?: string;
  sizes?: string;
} & Omit<ComponentProps<'div'>, 'children'>;

/** Game cover at the 3:4 box art ratio; width comes from the caller. */
export function Cover({ src, alt, srcSet, sizes, className, ...props }: CoverProps) {
  return (
    <div
      className={cn(
        'aspect-3/4 overflow-hidden rounded-md border border-line bg-surface-2 shadow-raised',
        className,
      )}
      {...props}
    >
      {src ? (
        <img
          src={src}
          srcSet={srcSet}
          sizes={sizes}
          alt={alt}
          loading="lazy"
          decoding="async"
          className="size-full object-cover"
        />
      ) : (
        <div role="img" aria-label={alt} className="flex size-full items-center justify-center">
          <Gamepad2 size={20} strokeWidth={1.5} className="text-fg-subtle" aria-hidden />
        </div>
      )}
    </div>
  );
}
