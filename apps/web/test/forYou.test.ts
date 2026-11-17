import { describe, expect, it } from 'vitest';
import {
  ALL_TAB,
  buildShelves,
  buildTabs,
  fitChips,
  parseGameId,
  type Recommendation,
} from '../src/lib/forYou.js';
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

describe('buildShelves', () => {
  const fit = (deviceId: string, status: 'green' | 'yellow' | 'hidden' | 'unknown') => ({
    deviceId,
    deviceName: deviceId,
    status,
    reason: '',
  });
  const pick = (
    igdbId: number,
    fits: ReturnType<typeof fit>[],
    hours: number | null = null,
  ): Recommendation =>
    ({
      rank: igdbId,
      game: { igdbId, name: `G${igdbId}` },
      fits,
      timeToBeat:
        hours === null ? null : { hastilyHours: null, normallyHours: hours, completelyHours: null },
    }) as unknown as Recommendation;
  const ids = (s: { picks: Recommendation[] }) => s.picks.map((p) => p.game.igdbId);

  it('always starts with All picks, in the given order', () => {
    const shelves = buildShelves([pick(2, []), pick(1, [])], []);
    expect(shelves).toHaveLength(1);
    expect(shelves[0]).toMatchObject({ id: ALL_TAB, title: 'All picks' });
    expect(ids(shelves[0]!)).toEqual([2, 1]);
  });

  it('adds a "Fits your" shelf per device holding only green fits, hiding empty ones', () => {
    const picks = [
      pick(1, [fit('pc', 'green'), fit('deck', 'yellow')]),
      pick(2, [fit('pc', 'yellow'), fit('deck', 'green')]),
      pick(3, [fit('pc', 'green'), fit('deck', 'unknown')]),
    ];
    const shelves = buildShelves(picks, [
      { id: 'pc', name: 'Laptop' },
      { id: 'deck', name: 'Steam Deck' },
      { id: 'ps5', name: 'PS5' },
    ]);
    expect(shelves.map((s) => s.title)).toEqual([
      'All picks',
      'Fits your Laptop',
      'Fits your Steam Deck',
    ]);
    expect(ids(shelves[1]!)).toEqual([1, 3]);
    expect(ids(shelves[2]!)).toEqual([2]);
  });

  it('adds Short sessions sorted by time to beat, only with at least 3 timed games', () => {
    const picks = [pick(1, [], 20), pick(2, [], 5), pick(3, [], null), pick(4, [], 9)];
    const short = buildShelves(picks, []).find((s) => s.title === 'Short sessions');
    expect(ids(short!)).toEqual([2, 4, 1]);
    expect(
      buildShelves([pick(1, [], 3), pick(2, [], 4), pick(3, [])], []).map((s) => s.title),
    ).toEqual(['All picks']);
  });
});

describe('fitChips', () => {
  it('maps each device fit to a HUD chip tone', () => {
    const fits = [
      { deviceId: 'a', deviceName: 'Laptop', status: 'green', reason: '' },
      { deviceId: 'b', deviceName: 'Deck', status: 'yellow', reason: '' },
      { deviceId: 'c', deviceName: 'PS5', status: 'hidden', reason: '' },
    ] as const;
    expect(fitChips(fits)).toEqual([
      { label: 'Laptop', tone: 'yes' },
      { label: 'Deck', tone: 'low' },
      { label: 'PS5', tone: 'no' },
    ]);
  });
});
