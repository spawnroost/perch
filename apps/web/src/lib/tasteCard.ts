import type { TasteSummary } from '@perch/core/browser';

/** Seconds before the first card item shows, and between items. */
const REVEAL_BASE_S = 0.15;
const REVEAL_STEP_S = 0.08;
const REVEAL_DURATION_S = 0.45;
/** How far an item rises into place, in px. */
const REVEAL_RISE_PX = 14;

/** Entrance of the nth card item: a staggered fade and rise; nothing moves when reduced. */
export function reveal(index: number, reduced: boolean) {
  if (reduced) {
    return { initial: false as const, animate: { opacity: 1, y: 0 }, transition: { duration: 0 } };
  }
  return {
    initial: { opacity: 0, y: REVEAL_RISE_PX },
    animate: { opacity: 1, y: 0 },
    transition: {
      delay: REVEAL_BASE_S + index * REVEAL_STEP_S,
      duration: REVEAL_DURATION_S,
      ease: [0.16, 1, 0.3, 1] as [number, number, number, number],
    },
  };
}

/** Milliseconds until `count` revealed items have all landed (0 when reduced). */
export function revealSettleMs(count: number, reduced: boolean): number {
  if (reduced) return 0;
  return Math.ceil(
    (REVEAL_BASE_S + Math.max(0, count - 1) * REVEAL_STEP_S + REVEAL_DURATION_S) * 1000,
  );
}

/** Hours for the card: one decimal under 10, whole and grouped above. */
export function formatHours(hours: number): string {
  if (hours === 0) return '0';
  return hours < 10 ? hours.toFixed(1) : Math.round(hours).toLocaleString('en-US');
}

const PLATFORM_LABELS: Record<string, string> = {
  pc: 'PC',
  ps5: 'PS5',
  ps4: 'PS4',
  xbox: 'Xbox',
  switch: 'Switch',
  switch2: 'Switch 2',
  mac: 'Mac',
  linux: 'Linux',
};

export function platformLabel(platform: string): string {
  return PLATFORM_LABELS[platform] ?? platform.toUpperCase();
}

export const shareLabel = (share: number): string => `${Math.round(share * 100)}%`;

/** Download name for the PNG, from the playstyle label. */
export function cardFilename(label: string | null | undefined): string {
  const slug = (label ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `perch-${slug || 'taste-card'}.png`;
}

const STATUS_ORDER = ['playing', 'finished', 'backlog', 'paused', 'dropped'] as const;
const STATUS_LABELS: Record<(typeof STATUS_ORDER)[number], string> = {
  playing: 'Playing',
  finished: 'Finished',
  backlog: 'Backlog',
  paused: 'Paused',
  dropped: 'Dropped',
};

/** Status counts in play order, leaving out the empty ones. */
export function statusTiles(counts: TasteSummary['statusCounts']) {
  return STATUS_ORDER.flatMap((status) =>
    (counts[status] ?? 0) > 0
      ? [{ status, label: STATUS_LABELS[status], count: counts[status] ?? 0 }]
      : [],
  );
}

/** The collage grid: 3 columns when there are enough covers, fewer otherwise; whole rows only. */
export function collageLayout<T>(covers: readonly T[]): { cols: number; items: T[] } {
  const cols = covers.length >= 6 ? 3 : covers.length >= 4 ? 2 : covers.length;
  if (cols === 0) return { cols: 0, items: [] };
  return { cols, items: covers.slice(0, covers.length - (covers.length % cols)) };
}

export interface ExportRenderOptions {
  pixelRatio: number;
  cacheBust: boolean;
  imagePlaceholder: string;
  filter: (node: HTMLElement) => boolean;
}
export type ExportRender = (node: HTMLElement, options: ExportRenderOptions) => Promise<string>;

/** A transparent pixel, shown in place of a cover that cannot be fetched for the export. */
const BLANK_PIXEL =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

/**
 * Renders the card to a PNG data URL, leaving out elements marked `data-export-skip` (the sheen). Cover images are fetched (IGDB allows any origin); if the
 * render still fails, it retries without any image, so the download never ends in an error for a cover.
 */
export async function exportCardPng(
  node: HTMLElement,
  render: ExportRender,
): Promise<{ dataUrl: string; withCovers: boolean }> {
  const keep = (n: HTMLElement) => n.dataset?.exportSkip === undefined;
  const base = { pixelRatio: 2, cacheBust: true, imagePlaceholder: BLANK_PIXEL, filter: keep };
  try {
    return { dataUrl: await render(node, base), withCovers: true };
  } catch {
    const dataUrl = await render(node, {
      ...base,
      filter: (n) => keep(n) && (n.tagName ?? '').toUpperCase() !== 'IMG',
    });
    return { dataUrl, withCovers: false };
  }
}
