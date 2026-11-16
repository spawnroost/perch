import { describe, expect, it } from 'vitest';
import type { RecommendationsResponse } from '@perch/core';
import {
  ALL_TAB,
  buildFitRows,
  buildTabs,
  collectFits,
  parseGameId,
  tabDeviceParam,
} from '../src/lib/forYou.js';
import { platformNames } from '../src/lib/platforms.js';

type Rec = RecommendationsResponse['recommendations'][number];
const rec = (igdbId: number, fit?: Rec['fit']): Rec => ({
  rank: 1,
  score: 1,
  backlog: false,
  reason: 'r',
  game: { igdbId, name: `g${igdbId}`, firstRelease: null, rating: null },
  ...(fit ? { fit } : {}),
});
const res = (...recommendations: Rec[]): RecommendationsResponse => ({ recommendations });

const devices = [
  { id: 'pc-1', name: 'Desktop' },
  { id: 'deck-1', name: 'Steam Deck' },
];

describe('tabs', () => {
  it('puts All first, then one tab per device', () => {
    expect(buildTabs(devices)).toEqual([
      { value: ALL_TAB, label: 'All' },
      { value: 'pc-1', label: 'Desktop' },
      { value: 'deck-1', label: 'Steam Deck' },
    ]);
  });

  it('maps the All tab to the "all" device filter and a device tab to its id', () => {
    expect(tabDeviceParam(ALL_TAB)).toBe('all');
    expect(tabDeviceParam('pc-1')).toBe('pc-1');
  });
});

describe('collectFits', () => {
  it('indexes statuses by device then game across responses', () => {
    const fits = collectFits([
      res(rec(1, { status: 'green', deviceId: 'pc-1' })),
      res(rec(1, { status: 'yellow', deviceId: 'deck-1' }), rec(2)),
      undefined,
    ]);
    expect(fits.get('pc-1')?.get(1)).toBe('green');
    expect(fits.get('deck-1')?.get(1)).toBe('yellow');
    expect(fits.get('deck-1')?.has(2)).toBe(false);
  });
});

describe('buildFitRows', () => {
  it('lists devices in order and skips those with no status for the game', () => {
    const fits = collectFits([
      res(rec(1, { status: 'yellow', deviceId: 'deck-1' })),
      res(rec(1, { status: 'green', deviceId: 'pc-1' })),
    ]);
    expect(buildFitRows(devices, fits, 1)).toEqual([
      { deviceId: 'pc-1', deviceName: 'Desktop', status: 'green' },
      { deviceId: 'deck-1', deviceName: 'Steam Deck', status: 'yellow' },
    ]);
    expect(buildFitRows(devices, fits, 2)).toEqual([]);
  });
});

describe('parseGameId', () => {
  it('accepts positive integers only', () => {
    expect(parseGameId('1942')).toBe(1942);
    for (const bad of [undefined, '', '0', '-3', '1.5', 'abc', '12x']) {
      expect(parseGameId(bad)).toBeNull();
    }
  });
});

describe('platformNames', () => {
  it('names known platforms in order and drops unknown ids', () => {
    expect(platformNames([6, 9999, 167])).toEqual(['Windows', 'PlayStation 5']);
  });
});
