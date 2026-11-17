import { describe, expect, it } from 'vitest';
import { recommendationsQuerySchema } from '../../src/schemas/recommendations.js';

describe('recommendationsQuerySchema limit', () => {
  it('defaults to 20 and allows up to 100', () => {
    expect(recommendationsQuerySchema.parse({}).limit).toBe(20);
    expect(recommendationsQuerySchema.parse({ limit: '100' }).limit).toBe(100);
  });

  it('rejects 0 and anything above 100', () => {
    expect(recommendationsQuerySchema.safeParse({ limit: '0' }).success).toBe(false);
    expect(recommendationsQuerySchema.safeParse({ limit: '101' }).success).toBe(false);
  });
});
