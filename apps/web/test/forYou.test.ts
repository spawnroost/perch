import { describe, expect, it } from 'vitest';
import { ALL_TAB, buildTabs, parseGameId } from '../src/lib/forYou.js';
import { platformNames } from '../src/lib/platforms.js';

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
