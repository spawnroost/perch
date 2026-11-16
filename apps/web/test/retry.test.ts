import { describe, expect, it } from 'vitest';
import { ApiError } from '../src/lib/api.js';
import { shouldRetry } from '../src/lib/retry.js';

describe('shouldRetry', () => {
  it('retries network failures (status 0) and 5xx up to twice', () => {
    expect(shouldRetry(0, new ApiError(0, 'offline'))).toBe(true);
    expect(shouldRetry(1, new ApiError(503, 'down'))).toBe(true);
    expect(shouldRetry(2, new ApiError(503, 'down'))).toBe(false);
  });
  it('does not retry client errors', () => {
    expect(shouldRetry(0, new ApiError(401, 'no'))).toBe(false);
    expect(shouldRetry(0, new ApiError(404, 'no'))).toBe(false);
  });
  it('retries unknown errors', () => {
    expect(shouldRetry(0, new Error('boom'))).toBe(true);
  });
});
