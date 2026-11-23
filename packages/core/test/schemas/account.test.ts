import { describe, expect, it } from 'vitest';
import { accountPatchSchema } from '../../src/schemas/account.js';

describe('accountPatchSchema', () => {
  it('takes a boolean hideFreeToPlay', () => {
    expect(accountPatchSchema.parse({ hideFreeToPlay: false })).toEqual({ hideFreeToPlay: false });
  });
  it('rejects an empty body and non-booleans', () => {
    expect(accountPatchSchema.safeParse({}).success).toBe(false);
    expect(accountPatchSchema.safeParse({ hideFreeToPlay: 'yes' }).success).toBe(false);
  });
});
