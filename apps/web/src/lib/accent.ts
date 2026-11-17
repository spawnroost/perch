import type { CSSProperties } from 'react';

export type AccentStyle = CSSProperties & { '--accent'?: string };

const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** Inline style that sets the runtime --accent for a subtree; empty when absent or malformed. */
export function accentStyle(hex: string | null | undefined): AccentStyle {
  return hex && HEX.test(hex) ? { '--accent': hex } : {};
}
