import type { PriceInfo, PriceOffer } from '../prices/schemas.js';

/** "$4.99". Prices from CheapShark are US dollars. */
export function formatUsd(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

export interface WatchState {
  /** null = any sale. */
  targetPrice: number | null;
  /** The deal the last digest announced, until it ends. */
  lastNotifiedPrice: number | null;
}

export type WatchDecision =
  { action: 'notify'; deal: PriceOffer } | { action: 'clear' } | { action: 'none' };

const CENT = 0.005;

/** Whether the offer is what the watch waits for: at or below the target, or any discount. */
export function isDeal(targetPrice: number | null, offer: PriceOffer): boolean {
  return targetPrice === null ? offer.savingsPct > 0 : offer.price <= targetPrice + CENT;
}

/**
 * What a daily check does for one watch. A deal is announced once: not again at the same or a
 * higher price, but a lower one is. When the deal ends the memory is cleared, so the next one is
 * announced afresh.
 */
export function evaluateWatch(watch: WatchState, prices: PriceInfo | null): WatchDecision {
  const best = prices?.best ?? null;
  if (best && isDeal(watch.targetPrice, best)) {
    const seen = watch.lastNotifiedPrice;
    return seen === null || best.price < seen - CENT
      ? { action: 'notify', deal: best }
      : { action: 'none' };
  }
  return watch.lastNotifiedPrice === null ? { action: 'none' } : { action: 'clear' };
}

export interface DigestItem {
  igdbId: number;
  name: string;
  targetPrice: number | null;
  deal: PriceOffer;
}

/** The plain-text digest mail: one block per game, deal links on their own lines. */
export function buildDigest(
  items: readonly DigestItem[],
  webOrigin: string,
): { subject: string; text: string } {
  const subject =
    items.length === 1
      ? `${items[0]!.name} is on sale`
      : `${items.length} games on your watchlist are on sale`;
  const blocks = items.map(({ name, targetPrice, deal }) => {
    const off =
      deal.savingsPct > 0 ? `, -${deal.savingsPct}% from ${formatUsd(deal.retailPrice)}` : '';
    const target = targetPrice === null ? '' : ` (your target: ${formatUsd(targetPrice)})`;
    return `${name}\n${formatUsd(deal.price)} at ${deal.store}${off}${target}\n${deal.url}`;
  });
  const manage = `${new URL('/account', webOrigin)}`;
  return {
    subject,
    text: [
      'Games you are watching have dropped to your price:',
      '',
      blocks.join('\n\n'),
      '',
      'Prices are in US dollars and can change at any time.',
      'Stop watching a game or change a target here:',
      manage,
    ].join('\n'),
  };
}
