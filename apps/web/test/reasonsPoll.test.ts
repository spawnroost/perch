import { describe, expect, it } from 'vitest';
import { createReasonsPoller, REASONS_MAX_POLLS, REASONS_POLL_MS } from '../src/lib/reasonsPoll.js';

describe('createReasonsPoller', () => {
  it('does not poll without pending reasons', () => {
    const next = createReasonsPoller();
    const q = {};
    expect(next(q, false, 40)).toBe(false);
  });

  it('polls while pending, then stops after the limit', () => {
    const next = createReasonsPoller();
    const q = {};
    let count = 1;
    let polls = 0;
    while (next(q, true, count) === REASONS_POLL_MS) {
      polls++;
      count++;
    }
    expect(polls).toBe(REASONS_MAX_POLLS - 1);
  });

  it('counts from the last settled response, not from the query lifetime', () => {
    const next = createReasonsPoller();
    const q = {};
    expect(next(q, false, 30)).toBe(false);
    expect(next(q, true, 31)).toBe(REASONS_POLL_MS);
    expect(next(q, true, 32)).toBe(REASONS_POLL_MS);
  });

  it('starts fresh for a query it has not seen settle', () => {
    const next = createReasonsPoller();
    expect(next({}, true, 12)).toBe(REASONS_POLL_MS);
  });

  it('gets a fresh allowance after a settled response resets it', () => {
    const next = createReasonsPoller();
    const q = {};
    for (let c = 1; c <= REASONS_MAX_POLLS + 2; c++) next(q, true, c);
    expect(next(q, true, 9)).toBe(false);
    next(q, false, 10);
    expect(next(q, true, 11)).toBe(REASONS_POLL_MS);
  });
});
