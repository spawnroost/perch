import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// Keep in step with the @theme block in styles/tokens.css.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      color: [
        'ground',
        'surface-1',
        'surface-2',
        'surface-3',
        'surface-4',
        'scrim',
        'line',
        'line-strong',
        'edge',
        'fg',
        'fg-muted',
        'fg-subtle',
        'on-accent',
        'accent',
        'accent-hover',
        'accent-press',
        'accent-soft',
        'accent-tint',
        'accent-wash',
        'fit-yes',
        'fit-yes-soft',
        'fit-low',
        'fit-low-soft',
        'fit-no',
        'fit-no-soft',
        'fit-unknown',
        'fit-unknown-soft',
        'device-pc',
        'device-pc-end',
        'device-mac',
        'device-mac-end',
        'device-handheld',
        'device-handheld-end',
        'device-console',
        'device-console-end',
      ],
      shadow: ['raised', 'card', 'lift', 'overlay', 'glow', 'cover-glow'],
      tracking: ['tight', 'display', 'hud'],
      text: ['2xs', 'display-sm', 'display-md', 'display-lg', 'display-xl'],
      font: ['sans', 'display', 'mono'],
      blur: ['hero'],
      ease: ['out', 'in-out', 'spring'],
    },
    classGroups: {
      duration: [{ duration: ['fast', 'base', 'slow', 'hero'] }],
      'font-family': [{ font: ['title', 'hud'] }],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
