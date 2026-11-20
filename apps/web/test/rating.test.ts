import { describe, expect, it } from 'vitest';
import { clickRating, rateFromKey, ratingLabel, tabStop } from '../src/lib/rating.js';

describe('rating keys', () => {
  it('number keys 1-5 set the rating', () => {
    for (const n of [1, 2, 3, 4, 5]) expect(rateFromKey(null, String(n))).toBe(n);
  });
  it('0, Backspace and Delete clear it', () => {
    for (const k of ['0', 'Backspace', 'Delete']) expect(rateFromKey(4, k)).toBeNull();
  });
  it('arrows step and clamp; from unrated right starts at 1 and left at 5', () => {
    expect(rateFromKey(3, 'ArrowRight')).toBe(4);
    expect(rateFromKey(5, 'ArrowUp')).toBe(5);
    expect(rateFromKey(3, 'ArrowLeft')).toBe(2);
    expect(rateFromKey(1, 'ArrowDown')).toBe(1);
    expect(rateFromKey(null, 'ArrowRight')).toBe(1);
    expect(rateFromKey(null, 'ArrowLeft')).toBe(5);
  });
  it('Home and End jump to the ends', () => {
    expect(rateFromKey(3, 'Home')).toBe(1);
    expect(rateFromKey(3, 'End')).toBe(5);
  });
  it('other keys, including 6-9, are ignored', () => {
    for (const k of ['6', '9', 'a', 'Tab', 'Enter']) expect(rateFromKey(3, k)).toBeUndefined();
  });
});

describe('rating clicks and labels', () => {
  it('clicking the current star clears, another star sets', () => {
    expect(clickRating(3, 3)).toBeNull();
    expect(clickRating(3, 5)).toBe(5);
    expect(clickRating(null, 2)).toBe(2);
  });
  it('the tab stop is the chosen star, else the first', () => {
    expect(tabStop(4)).toBe(4);
    expect(tabStop(null)).toBe(1);
  });
  it('labels carry the number and a word', () => {
    expect(ratingLabel(5)).toBe('5 of 5: Loved it');
    expect(ratingLabel(1)).toBe('1 of 5: Hated it');
  });
});
