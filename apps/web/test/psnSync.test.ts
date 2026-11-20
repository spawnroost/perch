import { describe, expect, it } from 'vitest';
import {
  PSN_BUSY_HELP,
  PSN_COOLDOWN_HELP,
  PSN_NOT_CONFIGURED_HELP,
  PSN_NOT_FOUND_HELP,
  PSN_NOT_LINKED_HELP,
  PSN_PRIVATE_HELP,
  PSN_UNAVAILABLE_HELP,
} from '@perch/core/browser';
import { psnErrorText } from '../src/lib/psnSync.js';
import { ApiError } from '../src/lib/api.js';

describe('psnErrorText', () => {
  it.each([
    ['psn_private', PSN_PRIVATE_HELP],
    ['psn_not_found', PSN_NOT_FOUND_HELP],
    ['psn_not_configured', PSN_NOT_CONFIGURED_HELP],
    ['psn_unavailable', PSN_UNAVAILABLE_HELP],
    ['psn_not_linked', PSN_NOT_LINKED_HELP],
    ['psn_busy', PSN_BUSY_HELP],
    ['psn_cooldown', PSN_COOLDOWN_HELP],
  ])('maps %s to its help text', (code, text) => {
    expect(psnErrorText(new ApiError(409, code))).toBe(text);
  });
  it('keeps other messages and has a fallback for non-errors', () => {
    expect(psnErrorText(new ApiError(400, 'invalid body'))).toBe('invalid body');
    expect(psnErrorText('x')).toBe('PlayStation sync failed. Try again.');
  });
  it('tells the user to try again in a minute on a cooldown', () => {
    expect(psnErrorText(new ApiError(429, 'psn_cooldown'))).toBe('Try again in a minute.');
  });
  it('says the sync is busy at the rate limit', () => {
    expect(PSN_BUSY_HELP).toBe('PlayStation sync is busy, try again later.');
  });
});
