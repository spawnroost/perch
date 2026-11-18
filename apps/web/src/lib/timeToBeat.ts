import type { GameDetailResponse } from '@perch/core';

type TimeToBeat = GameDetailResponse['timeToBeat'];

/** Main-story hours (else the closest figure); null with no data. */
export function timeToBeatHours(t: TimeToBeat): number | null {
  if (!t) return null;
  return t.normallyHours ?? t.hastilyHours ?? t.completelyHours;
}

const hoursText = (h: number) => `${Number.isInteger(h) ? h : h.toFixed(1)} h`;

/** "About 15 h to beat" from the main-story time (else the closest figure); null with no data. */
export function timeToBeatLabel(t: TimeToBeat): string | null {
  const hours = timeToBeatHours(t);
  if (hours === null) return null;
  return `About ${hoursText(hours)} to beat`;
}

const TIERS = [
  { key: 'hastily', label: 'Story', field: 'hastilyHours' },
  { key: 'normally', label: 'Story + extras', field: 'normallyHours' },
  { key: 'completely', label: '100%', field: 'completelyHours' },
] as const;

export interface TimeToBeatTier {
  key: (typeof TIERS)[number]['key'];
  label: string;
  hours: string;
  /** Bar width, 0 to 1, against the longest tier. */
  share: number;
}

/** The known tiers (Story, Story + extras, 100%) with bar widths and the player count behind them; null with no hours. */
export function timeToBeatTiers(
  t: TimeToBeat,
): { tiers: TimeToBeatTier[]; source: string | null } | null {
  if (!t) return null;
  const known = TIERS.flatMap((tier) => {
    const h = t[tier.field];
    return h !== null && h > 0 ? [{ tier, h }] : [];
  });
  if (known.length === 0) return null;
  const longest = Math.max(...known.map((k) => k.h));
  return {
    tiers: known.map(({ tier, h }) => ({
      key: tier.key,
      label: tier.label,
      hours: hoursText(h),
      share: h / longest,
    })),
    source:
      t.submissions > 0
        ? `from ${t.submissions.toLocaleString('en-US')} player${t.submissions === 1 ? '' : 's'}`
        : null,
  };
}
