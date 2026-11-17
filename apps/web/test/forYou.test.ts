import { describe, expect, it } from 'vitest';
import {
  ALL_TAB,
  SHORT_SESSION_MAX_HOURS,
  buildShelves,
  capChips,
  fitChips,
  cardKey,
  layoutOwners,
  parseGameId,
  pickChips,
  type Recommendation,
} from '../src/lib/forYou.js';
import { platformNames } from '../src/lib/platforms.js';

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
  type Fit = {
    deviceId: string;
    deviceName: string;
    status: 'green' | 'yellow' | 'hidden' | 'unknown';
    reason: string;
  };
  const pick = (igdbId: number, fits: Fit[], hours: number | null = null): Recommendation =>
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

  it('adds a "Fits your" shelf per device from its own feed, hiding empty ones', () => {
    // Device feeds come from the server; they may hold games outside the all-devices picks.
    const shelves = buildShelves(
      [pick(1, []), pick(2, [])],
      [
        { id: 'pc', name: 'Laptop', picks: [pick(7, []), pick(1, [])] },
        { id: 'deck', name: 'Steam Deck', picks: [pick(2, [])] },
        { id: 'ps5', name: 'PS5', picks: [] },
      ],
    );
    expect(shelves.map((s) => s.title)).toEqual([
      'All picks',
      'Fits your Laptop',
      'Fits your Steam Deck',
    ]);
    expect(ids(shelves[1]!)).toEqual([7, 1]);
    expect(ids(shelves[2]!)).toEqual([2]);
  });

  it('adds Short sessions sorted by time to beat, only picks within the hour cap', () => {
    const picks = [
      pick(1, [], SHORT_SESSION_MAX_HOURS + 1),
      pick(2, [], 5),
      pick(3, [], null),
      pick(4, [], 9),
      pick(5, [], SHORT_SESSION_MAX_HOURS),
    ];
    const short = buildShelves(picks, []).find((s) => s.title === 'Short sessions');
    expect(ids(short!)).toEqual([2, 4, 5]);
  });

  it('hides Short sessions below 3 short games, even with many timed ones', () => {
    const picks = [pick(1, [], 3), pick(2, [], 4), pick(3, []), pick(4, [], 40), pick(5, [], 60)];
    expect(buildShelves(picks, []).map((s) => s.title)).toEqual(['All picks']);
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

describe('pickChips', () => {
  const rec = (extra: object) =>
    ({
      fits: [{ deviceId: 'a', deviceName: 'Laptop', status: 'green', reason: '' }],
      backlog: false,
      deck: null,
      ...extra,
    }) as unknown as Recommendation;

  it('lists fit chips only when the pick is neither backlog nor on Deck', () => {
    expect(pickChips(rec({}))).toEqual([{ label: 'Laptop', tone: 'yes' }]);
  });

  it('adds a plain Backlog chip and a toned Deck chip after the fits', () => {
    expect(pickChips(rec({ backlog: true, deck: 'playable' }))).toEqual([
      { label: 'Laptop', tone: 'yes' },
      { label: 'Backlog', tone: 'unknown', plain: true },
      { label: 'Deck: Playable', tone: 'low' },
    ]);
  });

  it('drops the Deck chip when the user has a Steam Deck device (its fit chip covers it)', () => {
    expect(pickChips(rec({ backlog: true, deck: 'playable' }), { hasDeckDevice: true })).toEqual([
      { label: 'Laptop', tone: 'yes' },
      { label: 'Backlog', tone: 'unknown', plain: true },
    ]);
  });
});

describe('capChips', () => {
  const chips = ['A', 'B', 'C', 'D'].map((label) => ({ label, tone: 'yes' as const }));

  it('returns the chips untouched when they fit', () => {
    expect(capChips(chips.slice(0, 2), 2)).toEqual(chips.slice(0, 2));
  });

  it('keeps the first max chips and adds a plain +N chip for the rest', () => {
    expect(capChips(chips, 2)).toEqual([
      chips[0],
      chips[1],
      { label: '+2', tone: 'unknown', plain: true, srLabel: 'and 2 more: C, D' },
    ]);
  });

  it('describes a single hidden chip for screen readers', () => {
    const three = [chips[0]!, chips[1]!, { label: 'Deck: Verified', tone: 'yes' as const }];
    expect(capChips(three, 2).at(-1)?.srLabel).toBe('and 1 more: Deck: Verified');
  });
});

describe('layoutOwners', () => {
  const p = (igdbId: number) => ({ game: { igdbId } }) as unknown as Recommendation;

  it('gives each game one shared-element owner: its first card in shelf order', () => {
    const owners = layoutOwners([
      { id: 'all', title: 'All', picks: [p(1), p(2)] },
      { id: 'pc', title: 'PC', picks: [p(2), p(3)] },
    ]);
    expect([...owners]).toEqual([cardKey('all', 1), cardKey('all', 2), cardKey('pc', 3)]);
  });
});
