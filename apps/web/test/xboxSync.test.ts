import { describe, expect, it } from 'vitest';
import {
  XBOX_BUSY_HELP,
  XBOX_NOT_CONFIGURED_HELP,
  XBOX_NOT_FOUND_HELP,
  XBOX_NOT_LINKED_HELP,
  XBOX_PRIVATE_HELP,
  XBOX_UNAVAILABLE_HELP,
} from '@perch/core/browser';
import { xboxErrorText } from '../src/lib/xboxSync.js';
import { ApiError } from '../src/lib/api.js';

describe('xboxErrorText', () => {
  it.each([
    ['xbox_private', XBOX_PRIVATE_HELP],
    ['xbox_not_found', XBOX_NOT_FOUND_HELP],
    ['xbox_not_configured', XBOX_NOT_CONFIGURED_HELP],
    ['xbox_unavailable', XBOX_UNAVAILABLE_HELP],
    ['xbox_not_linked', XBOX_NOT_LINKED_HELP],
    ['xbox_busy', XBOX_BUSY_HELP],
  ])('maps %s to its help text', (code, text) => {
    expect(xboxErrorText(new ApiError(409, code))).toBe(text);
  });
  it('keeps other messages and has a fallback for non-errors', () => {
    expect(xboxErrorText(new ApiError(400, 'invalid body'))).toBe('invalid body');
    expect(xboxErrorText('x')).toBe('Xbox sync failed. Try again.');
  });
  it('says the sync is busy at the rate limit', () => {
    expect(XBOX_BUSY_HELP).toBe('Xbox sync is busy, try again later.');
  });
});
