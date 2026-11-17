import { describe, expect, it } from 'vitest';
import { recommendationsQuerySchema } from '../../src/schemas/recommendations.js';

describe('recommendationsQuerySchema limit', () => {
  it('defaults to 20 and allows up to 60', () => {
    expect(recommendationsQuerySchema.parse({}).limit).toBe(20);
    expect(recommendationsQuerySchema.parse({ limit: '60' }).limit).toBe(60);
  });

  it('rejects 0 and anything above 60', () => {
    expect(recommendationsQuerySchema.safeParse({ limit: '0' }).success).toBe(false);
    expect(recommendationsQuerySchema.safeParse({ limit: '61' }).success).toBe(false);
  });
});
