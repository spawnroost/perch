import type { DeckCategory, FitStatus } from '@perch/core';

export type Tone = 'yes' | 'low' | 'no' | 'unknown';
export interface Display {
  label: string;
  tone: Tone;
}

const FIT: Record<FitStatus, Display> = {
  green: { label: 'Runs well', tone: 'yes' },
  yellow: { label: 'Runs on low', tone: 'low' },
  hidden: { label: "Won't run", tone: 'no' },
  unknown: { label: 'Unknown', tone: 'unknown' },
};

const DECK: Record<DeckCategory, Display> = {
  verified: { label: 'Verified', tone: 'yes' },
  playable: { label: 'Playable', tone: 'low' },
  unsupported: { label: 'Unsupported', tone: 'no' },
  unknown: { label: 'Untested', tone: 'unknown' },
};

export function fitDisplay(status: FitStatus): Display {
  return FIT[status];
}

export function deckDisplay(category: DeckCategory): Display {
  return DECK[category];
}

const FIT_REASON: Record<FitStatus, string> = {
  green: 'Meets the recommended requirements.',
  yellow: 'Meets the minimum but not the recommended requirements.',
  hidden: 'Not on this platform, or below its minimum requirements.',
  unknown: 'No requirements data to check yet.',
};

/** One-line explanation of a will-it-run status. */
export function fitReason(status: FitStatus): string {
  return FIT_REASON[status];
}
