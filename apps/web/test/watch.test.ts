import { describe, expect, it } from 'vitest';
import type { PriceInfo, Watch } from '@perch/core/browser';
import { parseTargetPrice, targetInputValue, watchStatus } from '../src/lib/watch.js';

const prices = (price: number, retail = 10, savingsPct = 50): PriceInfo => ({
  currency: 'USD',
  best: {
    store: 'GOG',
    price,
    retailPrice: retail,
    savingsPct: retail > price ? savingsPct : 0,
    url: 'https://www.cheapshark.com/redirect?dealID=x',
  },
  historicLow: null,
});
const watch = (targetPrice: number | null, p: PriceInfo | null): Watch => ({
  igdbId: 1,
  name: 'G',
  slug: 'g',
  coverUrlSmall: null,
  accent: null,
  targetPrice,
  createdAt: '2026-01-01T00:00:00.000Z',
  prices: p,
});

describe('parseTargetPrice', () => {
  it('treats empty input as any sale', () => {
    expect(parseTargetPrice('')).toEqual({ ok: true, value: null });
    expect(parseTargetPrice('  ')).toEqual({ ok: true, value: null });
  });
  it('reads dollars, with or without the sign and cents', () => {
    expect(parseTargetPrice('5')).toEqual({ ok: true, value: 5 });
    expect(parseTargetPrice('$4.5')).toEqual({ ok: true, value: 4.5 });
    expect(parseTargetPrice('4,99')).toEqual({ ok: true, value: 4.99 });
    expect(parseTargetPrice('9,99')).toEqual({ ok: true, value: 9.99 });
    expect(parseTargetPrice('9.999')).toEqual({ ok: true, value: 10 });
  });
  it('reads thousands separators', () => {
    expect(parseTargetPrice('1,000')).toEqual({ ok: true, value: 1000 });
    expect(parseTargetPrice('$1,234.50')).toEqual({ ok: true, value: 1234.5 });
    expect(parseTargetPrice('1.000,50')).toEqual({ ok: true, value: 1000.5 });
    expect(parseTargetPrice('12,34,5').ok).toBe(false);
  });
  it('rejects zero, negatives and words', () => {
    for (const bad of ['0', '-3', 'free', '1e3x', '20000']) {
      expect(parseTargetPrice(bad).ok).toBe(false);
    }
  });
});

describe('targetInputValue', () => {
  it('is empty for any sale and plain dollars otherwise', () => {
    expect(targetInputValue(null)).toBe('');
    expect(targetInputValue(5)).toBe('5.00');
  });
});

describe('watchStatus', () => {
  it('any-sale watch: on sale or waiting', () => {
    expect(watchStatus(watch(null, prices(5)))).toEqual({
      tone: 'yes',
      label: 'On sale',
      detail: '$5.00 at GOG, -50%',
    });
    expect(watchStatus(watch(null, prices(10, 10)))).toEqual({
      tone: 'neutral',
      label: 'Waiting for a sale',
      detail: '$10.00 at GOG',
    });
  });
  it('target watch: at the price, or how far above it', () => {
    expect(watchStatus(watch(6, prices(5)))).toEqual({
      tone: 'yes',
      label: 'At your price',
      detail: '$5.00 at GOG, target $6.00',
    });
    expect(watchStatus(watch(4, prices(5)))).toEqual({
      tone: 'neutral',
      label: '$1.00 above target',
      detail: '$5.00 at GOG, target $4.00',
    });
  });
  it('without prices it says so', () => {
    expect(watchStatus(watch(null, null))).toEqual({
      tone: 'unknown',
      label: 'No price yet',
      detail: 'Not found on a PC store, or still looking.',
    });
  });
});
