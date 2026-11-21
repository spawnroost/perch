import { describe, expect, it } from 'vitest';
import { rouletteQuerySchema } from '../../src/schemas/roulette.js';

describe('rouletteQuerySchema', () => {
  it('accepts an empty query', () => {
    expect(rouletteQuerySchema.parse({})).toEqual({});
  });

  it('parses minutes, mood and the exclude list', () => {
    expect(
      rouletteQuerySchema.parse({ device: 'd1', minutes: '30', mood: 'chill', exclude: '12, 40' }),
    ).toEqual({ device: 'd1', minutes: 30, mood: 'chill', exclude: [12, 40] });
    expect(rouletteQuerySchema.parse({ exclude: '' })).toEqual({ exclude: [] });
  });

  it('rejects an unknown mood, bad minutes, junk or too many ids', () => {
    expect(rouletteQuerySchema.safeParse({ mood: 'spicy' }).success).toBe(false);
    expect(rouletteQuerySchema.safeParse({ minutes: '2' }).success).toBe(false);
    expect(rouletteQuerySchema.safeParse({ exclude: '1,x' }).success).toBe(false);
    expect(rouletteQuerySchema.safeParse({ exclude: '1,,2' }).success).toBe(false);
    expect(
      rouletteQuerySchema.safeParse({
        exclude: Array.from({ length: 11 }, (_, i) => i + 1).join(','),
      }).success,
    ).toBe(false);
  });
});
