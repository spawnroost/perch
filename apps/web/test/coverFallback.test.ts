import { describe, expect, it } from 'vitest';
import { coverFallbackLabel, showsImage } from '@/lib/coverFallback';

describe('showsImage', () => {
  it('needs a src', () => {
    expect(showsImage(null, null)).toBe(false);
    expect(showsImage('', null)).toBe(false);
    expect(showsImage(undefined, null)).toBe(false);
    expect(showsImage('/a.jpg', null)).toBe(true);
  });

  it('drops a src that failed to load, but not a new one', () => {
    expect(showsImage('/a.jpg', '/a.jpg')).toBe(false);
    expect(showsImage('/b.jpg', '/a.jpg')).toBe(true);
  });
});

describe('coverFallbackLabel', () => {
  it('collapses whitespace and trims', () => {
    expect(coverFallbackLabel('  Hades \n II ')).toBe('Hades II');
  });

  it('is empty without a title', () => {
    expect(coverFallbackLabel(null)).toBe('');
    expect(coverFallbackLabel(undefined)).toBe('');
  });

  it('cuts long titles with an ellipsis', () => {
    const out = coverFallbackLabel('A'.repeat(100));
    expect(out).toHaveLength(60);
    expect(out.endsWith('…')).toBe(true);
  });
});
