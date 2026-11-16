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
        'scrim',
        'line',
        'line-strong',
        'edge',
        'fg',
        'fg-muted',
        'fg-subtle',
        'coral',
        'coral-hover',
        'coral-press',
        'coral-soft',
        'on-coral',
        'fit-yes',
        'fit-yes-soft',
        'fit-low',
        'fit-low-soft',
        'fit-no',
        'fit-no-soft',
        'fit-unknown',
        'fit-unknown-soft',
      ],
      shadow: ['raised', 'overlay'],
      tracking: ['tight', 'display'],
    },
    classGroups: {
      duration: [{ duration: ['fast', 'base', 'slow'] }],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
