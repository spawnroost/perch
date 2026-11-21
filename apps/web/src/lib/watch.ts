import type { Watch } from '@perch/core/browser';
import { formatUsd } from './prices';

/** What a target-price field holds: a price, or empty for "any sale". */
export function parseTargetPrice(
  text: string,
): { ok: true; value: number | null } | { ok: false; error: string } {
  const cleaned = text.trim().replace(/^\$/, '').replace(',', '.');
  if (cleaned === '') return { ok: true, value: null };
  const n = /^\d+(\.\d+)?$/.test(cleaned) ? Number(cleaned) : NaN;
  const cents = Math.round(n * 100) / 100;
  if (!Number.isFinite(n) || cents <= 0 || cents > 10_000) {
    return { ok: false, error: 'Enter a price in dollars, or leave it empty for any sale.' };
  }
  return { ok: true, value: cents };
}

/** The field's text for a stored target. */
export function targetInputValue(target: number | null): string {
  return target === null ? '' : target.toFixed(2);
}

export interface WatchStatus {
  tone: 'yes' | 'neutral' | 'unknown';
  label: string;
  detail: string;
}

/** Current price against the watch: has it reached the target (or a sale), and how far off is it. */
export function watchStatus(watch: Pick<Watch, 'targetPrice' | 'prices'>): WatchStatus {
  const best = watch.prices?.best;
  if (!best) {
    return {
      tone: 'unknown',
      label: 'No price yet',
      detail: 'Not found on a PC store, or still looking.',
    };
  }
  const now = `${formatUsd(best.price)} at ${best.store}`;
  const target = watch.targetPrice;
  if (target === null) {
    return best.savingsPct > 0
      ? { tone: 'yes', label: 'On sale', detail: `${now}, -${best.savingsPct}%` }
      : { tone: 'neutral', label: 'Waiting for a sale', detail: now };
  }
  const detail = `${now}, target ${formatUsd(target)}`;
  return best.price <= target
    ? { tone: 'yes', label: 'At your price', detail }
    : { tone: 'neutral', label: `${formatUsd(best.price - target)} above target`, detail };
}
