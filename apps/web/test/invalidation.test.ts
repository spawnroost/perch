import { describe, expect, it } from 'vitest';
import { devicesAffected, libraryAffected } from '../src/lib/invalidation.js';
import { queryKeys } from '../src/lib/queryKeys.js';

describe('invalidation', () => {
  it('a library change refreshes the library, picks and game pages', () => {
    expect(libraryAffected).toEqual([
      queryKeys.library,
      queryKeys.recommendationsAll,
      queryKeys.gameDetailAll,
    ]);
  });
  it('a device change refreshes the devices, picks and game pages', () => {
    expect(devicesAffected).toEqual([
      queryKeys.devices,
      queryKeys.recommendationsAll,
      queryKeys.gameDetailAll,
    ]);
  });
  it('the detail prefix matches per-game keys', () => {
    expect(queryKeys.game(7).slice(0, queryKeys.gameDetailAll.length)).toEqual(
      queryKeys.gameDetailAll,
    );
  });
});
