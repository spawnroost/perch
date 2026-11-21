import type { PriceInfo } from '@perch/core/browser';
import { externalUrl } from './gameFacts';

/** "$4.99"; "Free" at zero. CheapShark prices are all US dollars. */
export function formatUsd(amount: number): string {
  return amount === 0 ? 'Free' : `$${amount.toFixed(2)}`;
}

const MONTH = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

export interface PriceSummary {
  best: {
    store: string;
    price: string;
    /** The price before the discount; null when not on sale. */
    was: string | null;
    discount: string | null;
    url: string;
  } | null;
  low: {
    price: string;
    /** "Jun 2019"; null when the date is unknown. */
    when: string | null;
    /** True when today's best price equals the historic low. */
    matched: boolean;
  } | null;
}

/** Display strings for the "Where to buy" price lines. */
export function priceSummary(prices: PriceInfo | null | undefined): PriceSummary {
  if (!prices) return { best: null, low: null };
  const url = prices.best ? externalUrl(prices.best.url) : null;
  const best =
    prices.best && url
      ? {
          store: prices.best.store,
          price: formatUsd(prices.best.price),
          was: prices.best.savingsPct > 0 ? formatUsd(prices.best.retailPrice) : null,
          discount: prices.best.savingsPct > 0 ? `-${prices.best.savingsPct}%` : null,
          url,
        }
      : null;
  const low = prices.historicLow
    ? {
        price: formatUsd(prices.historicLow.price),
        when: prices.historicLow.date ? MONTH.format(new Date(prices.historicLow.date)) : null,
        matched: prices.best !== null && prices.best.price <= prices.historicLow.price,
      }
    : null;
  return { best, low };
}
