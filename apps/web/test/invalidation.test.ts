import { describe, expect, it } from 'vitest';
import { devicesAffected, libraryAffected } from '../src/lib/invalidation.js';
import { queryKeys } from '../src/lib/queryKeys.js';

describe('invalidation', () => {
  it('a library change refreshes the library, picks and game pages', () => {
    expect(libraryAffected).toEqual([
      queryKeys.library,
      queryKeys.recommendationsAll,
      queryKeys.browseAll,
      queryKeys.gameDetailAll,
      queryKeys.gameFitsAll,
      queryKeys.tasteCard,
    ]);
  });
  it('a device change refreshes the devices, picks and game pages', () => {
    expect(devicesAffected).toEqual([
      queryKeys.devices,
      queryKeys.recommendationsAll,
      queryKeys.browseAll,
      queryKeys.gameDetailAll,
      queryKeys.gameFitsAll,
    ]);
  });
  it('search fits are a sibling of the detail keys, keyed by sorted ids', () => {
    expect(queryKeys.gameFits([3, 1, 2])).toEqual(['games', 'fit', [1, 2, 3]]);
    expect(queryKeys.gameFits([2, 1])).toEqual(queryKeys.gameFits([1, 2]));
    expect(queryKeys.gameFits([1]).slice(0, queryKeys.gameDetailAll.length)).not.toEqual(
      queryKeys.gameDetailAll,
    );
    expect(queryKeys.gameFits([1]).slice(0, queryKeys.gameFitsAll.length)).toEqual(
      queryKeys.gameFitsAll,
    );
  });
  it('the detail prefix matches per-game keys', () => {
    expect(queryKeys.game(7).slice(0, queryKeys.gameDetailAll.length)).toEqual(
      queryKeys.gameDetailAll,
    );
  });
});
