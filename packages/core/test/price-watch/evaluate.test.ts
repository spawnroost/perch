import { describe, expect, it } from 'vitest';
import { buildDigest, evaluateWatch, watchBodySchema, type PriceInfo } from '../../src/index.js';

const prices = (price: number, retail = 20, savingsPct = 50): PriceInfo => ({
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
const watch = (targetPrice: number | null, lastNotifiedPrice: number | null = null) => ({
  targetPrice,
  lastNotifiedPrice,
});

describe('evaluateWatch', () => {
  it('any-sale watch notifies on a discounted price', () => {
    const r = evaluateWatch(watch(null), prices(10));
    expect(r).toMatchObject({
      action: 'notify',
      deal: { price: 10, store: 'GOG', savingsPct: 50 },
    });
  });
  it('any-sale watch ignores the regular price', () => {
    expect(evaluateWatch(watch(null), prices(20, 20))).toEqual({ action: 'none' });
  });
  it('target watch notifies at or below the target, even without a sale', () => {
    expect(evaluateWatch(watch(15), prices(15, 15)).action).toBe('notify');
    expect(evaluateWatch(watch(15), prices(15.01)).action).toBe('none');
  });
  it('does not repeat a deal it already announced', () => {
    expect(evaluateWatch(watch(null, 10), prices(10))).toEqual({ action: 'none' });
    expect(evaluateWatch(watch(null, 10), prices(12))).toEqual({ action: 'none' });
  });
  it('announces a better price than the last one', () => {
    expect(evaluateWatch(watch(null, 10), prices(8)).action).toBe('notify');
  });
  it('clears the memory once the deal is over, so a later one is announced', () => {
    expect(evaluateWatch(watch(null, 10), prices(20, 20))).toEqual({ action: 'clear' });
    expect(evaluateWatch(watch(null, 10), null)).toEqual({ action: 'clear' });
    expect(evaluateWatch(watch(null), null)).toEqual({ action: 'none' });
  });
  it('does nothing without a best offer', () => {
    expect(evaluateWatch(watch(5), { currency: 'USD', best: null, historicLow: null })).toEqual({
      action: 'none',
    });
  });
});

describe('buildDigest', () => {
  const item = (name: string, target: number | null) => ({
    igdbId: 1,
    name,
    targetPrice: target,
    deal: {
      store: 'GOG',
      price: 4.99,
      retailPrice: 9.99,
      savingsPct: 50,
      url: 'https://www.cheapshark.com/redirect?dealID=x',
    },
  });
  it('names the game in the subject when there is one', () => {
    const d = buildDigest([item('Celeste', null)], 'https://perch.test');
    expect(d.subject).toBe('Celeste is on sale');
    expect(d.text).toContain('Celeste');
    expect(d.text).toContain('$4.99 at GOG');
    expect(d.text).toContain('-50%');
    expect(d.text).toContain('https://www.cheapshark.com/redirect?dealID=x');
    expect(d.text).toContain('https://perch.test/account');
  });
  it('counts the games otherwise and mentions a target', () => {
    const d = buildDigest([item('A', 5), item('B', null)], 'https://perch.test/');
    expect(d.subject).toBe('2 games on your watchlist are on sale');
    expect(d.text).toContain('your target: $5.00');
    expect(d.text).toContain('https://perch.test/account');
    expect(d.text).not.toContain('perch.test//');
  });
});

describe('watchBodySchema', () => {
  it('takes a positive price rounded to cents, or null for any sale', () => {
    expect(watchBodySchema.parse({ targetPrice: null }).targetPrice).toBeNull();
    expect(watchBodySchema.parse({ targetPrice: 9.999 }).targetPrice).toBe(10);
    expect(watchBodySchema.safeParse({ targetPrice: 0 }).success).toBe(false);
    expect(watchBodySchema.safeParse({ targetPrice: -1 }).success).toBe(false);
    expect(watchBodySchema.safeParse({}).success).toBe(false);
  });
});
