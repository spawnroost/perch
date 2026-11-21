import { describe, expect, it } from 'vitest';
import type { PriceInfo } from '@perch/core/browser';
import { formatUsd, priceSummary } from '../src/lib/prices.js';

const info: PriceInfo = {
  currency: 'USD',
  best: {
    store: 'GOG',
    price: 4.99,
    retailPrice: 9.99,
    savingsPct: 50,
    url: 'https://www.cheapshark.com/redirect?dealID=x',
  },
  historicLow: { price: 0.99, date: '2019-06-25T18:01:40.000Z' },
};

describe('formatUsd', () => {
  it('shows cents, and free as Free', () => {
    expect(formatUsd(4.99)).toBe('$4.99');
    expect(formatUsd(60)).toBe('$60.00');
    expect(formatUsd(0)).toBe('Free');
  });
});

describe('priceSummary', () => {
  it('describes the best offer and the historic low', () => {
    expect(priceSummary(info)).toEqual({
      best: {
        store: 'GOG',
        price: '$4.99',
        was: '$9.99',
        discount: '-50%',
        url: 'https://www.cheapshark.com/redirect?dealID=x',
      },
      low: { price: '$0.99', when: 'Jun 2019', matched: false },
    });
  });
  it('has no discount or was-price when not on sale', () => {
    const s = priceSummary({ ...info, best: { ...info.best!, retailPrice: 4.99, savingsPct: 0 } });
    expect(s.best).toMatchObject({ was: null, discount: null });
  });
  it('flags a best price that matches the historic low', () => {
    const s = priceSummary({ ...info, historicLow: { price: 4.99, date: null } });
    expect(s.low).toEqual({ price: '$4.99', when: null, matched: true });
  });
  it('drops a link that is not http(s)', () => {
    const bad = { ...info, best: { ...info.best!, url: 'ftp://x.test/deal' } } as PriceInfo;
    expect(priceSummary(bad).best).toBeNull();
  });
  it('is empty without prices', () => {
    expect(priceSummary(null)).toEqual({ best: null, low: null });
  });
});
