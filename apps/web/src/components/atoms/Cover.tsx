import { useState, type ComponentProps } from 'react';
import { Gamepad2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { coverFallbackLabel, showsImage } from '@/lib/coverFallback';

export type CoverProps = {
  src: string | null;
  alt: string;
  /** Game title for the placeholder shown when there is no image or it fails to load. */
  label?: string;
  srcSet?: string;
  sizes?: string;
} & Omit<ComponentProps<'div'>, 'children'>;

/**
 * Game cover at the 3:4 box art ratio; width comes from the caller. An empty alt makes it decorative.
 * With no image, or one that fails to load, it shows the title on the game's accent gradient (the
 * title is dropped on thumbnails too small to read it).
 */
export function Cover({ src, alt, label, srcSet, sizes, className, ...props }: CoverProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const title = coverFallbackLabel(label ?? alt.replace(/ cover$/i, ''));
  return (
    <div
      className={cn(
        '@container aspect-3/4 overflow-hidden rounded-md border border-line bg-surface-2 shadow-raised',
        className,
      )}
      {...props}
    >
      {showsImage(src, failedSrc) ? (
        <img
          src={src}
          srcSet={srcSet}
          sizes={sizes}
          alt={alt}
          loading="lazy"
          decoding="async"
          onError={() => setFailedSrc(src)}
          className="size-full object-cover"
        />
      ) : (
        <div
          {...(alt ? { role: 'img', 'aria-label': alt } : { 'aria-hidden': true })}
          className="flex size-full flex-col items-center justify-center gap-2 bg-linear-to-br from-accent-tint to-surface-2 p-2 text-center"
        >
          <Gamepad2 size={20} strokeWidth={1.5} className="shrink-0 text-fg-muted" aria-hidden />
          {title ? (
            <span
              aria-hidden
              className="hidden line-clamp-5 font-title text-sm leading-tight text-fg wrap-break-word @min-[6rem]:block @min-[10rem]:text-lg"
            >
              {title}
            </span>
          ) : null}
        </div>
      )}
    </div>
  );
}
