import { describe, expect, it } from 'vitest';
import { CARD_WIDTH, withCardWidth } from '../src/lib/cardWidth.js';

describe('withCardWidth', () => {
  it('applies the default width when the caller sets none', () => {
    expect(withCardWidth(undefined)).toBe(CARD_WIDTH);
    expect(withCardWidth('mt-2')).toBe(CARD_WIDTH);
  });

  it('drops the default width when the caller passes any width', () => {
    for (const w of ['w-full', 'mt-2 w-32', 'sm:w-48', 'lg:w-auto', 'min-w-0 w-1/2']) {
      expect(withCardWidth(w)).toBe('');
    }
  });

  it('does not mistake max-w or min-w for a width', () => {
    expect(withCardWidth('max-w-xs min-w-0')).toBe(CARD_WIDTH);
  });
});
