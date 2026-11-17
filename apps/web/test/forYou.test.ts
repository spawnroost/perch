import { describe, expect, it } from 'vitest';
import {
  ALL_TAB,
  BACKLOG_ID,
  SHORT_SESSIONS_ID,
  SHORT_SESSION_MAX_HOURS,
  deviceOptions,
  buildShelves,
  capChips,
  fitChips,
  cardKey,
  layoutOwners,
  parseGameId,
  platformChips,
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
  const pick = (
    igdbId: number,
    opts: { source?: number | null; hours?: number | null; backlog?: boolean } = {},
  ): Recommendation => {
    const { source = null, hours = null, backlog = false } = opts;
    return {
      rank: igdbId,
      backlog,
      game: { igdbId, name: `G${igdbId}` },
      sourceGame: source === null ? null : { igdbId: source, name: `S${source}` },
      fits: [],
      timeToBeat:
        hours === null ? null : { hastilyHours: null, normallyHours: hours, completelyHours: null },
    } as unknown as Recommendation;
  };
  const ids = (s: { picks: Recommendation[] }) => s.picks.map((p) => p.game.igdbId);
  const titles = (picks: Recommendation[], hero?: number) =>
    buildShelves(picks, hero).map((s) => s.title);

  it('groups picks by their source game, in rank order, one shelf per source with 2+ picks', () => {
    const shelves = buildShelves([
      pick(1, { source: 10 }),
      pick(2, { source: 20 }),
      pick(3, { source: 10 }),
      pick(4, { source: 20 }),
      pick(5, { source: 20 }),
    ]);
    expect(shelves.map((s) => s.title)).toEqual([
      'Because you played S20',
      'Because you played S10',
    ]);
    expect(ids(shelves[0]!)).toEqual([2, 4, 5]);
    expect(ids(shelves[1]!)).toEqual([1, 3]);
    expect(shelves[1]!.id).toBe('because-10');
  });

  it('puts lone-source and source-less picks on a final More picks shelf', () => {
    const shelves = buildShelves([
      pick(1, { source: 10 }),
      pick(2, { source: 10 }),
      pick(3, { source: 30 }),
      pick(4),
    ]);
    expect(shelves.map((s) => s.title)).toEqual(['Because you played S10', 'More picks']);
    expect(ids(shelves[1]!)).toEqual([3, 4]);
  });

  it('adds Short sessions sorted by time to beat, only picks within the hour cap', () => {
    const picks = [
      pick(1, { hours: SHORT_SESSION_MAX_HOURS + 1 }),
      pick(2, { hours: 5 }),
      pick(3),
      pick(4, { hours: 9 }),
      pick(5, { hours: SHORT_SESSION_MAX_HOURS }),
    ];
    const short = buildShelves(picks).find((s) => s.id === SHORT_SESSIONS_ID);
    expect(short!.title).toBe('Short sessions');
    expect(ids(short!)).toEqual([2, 4, 5]);
  });

  it('hides Short sessions below 3 short games', () => {
    const picks = [pick(1, { hours: 3 }), pick(2, { hours: 4 }), pick(3), pick(4, { hours: 40 })];
    expect(titles(picks)).not.toContain('Short sessions');
  });

  it('adds From your backlog for owned, not started picks', () => {
    const shelves = buildShelves([pick(1), pick(2, { backlog: true }), pick(3, { backlog: true })]);
    const backlog = shelves.find((s) => s.id === BACKLOG_ID);
    expect(backlog!.title).toBe('From your backlog');
    expect(ids(backlog!)).toEqual([2, 3]);
  });

  it('shows each game once: backlog, then short sessions, then source groups', () => {
    const picks = [
      pick(1, { source: 10, hours: 4, backlog: true }),
      pick(2, { source: 10, hours: 4 }),
      pick(3, { source: 10, hours: 5 }),
      pick(4, { source: 10, hours: 6 }),
      pick(5, { source: 10 }),
      pick(6, { source: 10 }),
    ];
    const shelves = buildShelves(picks);
    expect(Object.fromEntries(shelves.map((s) => [s.id, ids(s)]))).toEqual({
      'because-10': [5, 6],
      [SHORT_SESSIONS_ID]: [2, 3, 4],
      [BACKLOG_ID]: [1],
    });
    const all = shelves.flatMap(ids);
    expect(new Set(all).size).toBe(all.length);
  });

  it('keeps the hero game off every shelf', () => {
    const picks = [pick(1, { source: 10 }), pick(2, { source: 10 }), pick(3, { source: 10 })];
    const shelves = buildShelves(picks, 1);
    expect(shelves.flatMap(ids)).toEqual([2, 3]);
  });

  it('returns no shelves when there is nothing to show', () => {
    expect(buildShelves([])).toEqual([]);
    expect(buildShelves([pick(1)], 1)).toEqual([]);
  });
});

describe('deviceOptions', () => {
  it('lists All first, then each device', () => {
    expect(deviceOptions([{ id: 'a', name: 'Laptop' }])).toEqual([
      { id: ALL_TAB, label: 'All' },
      { id: 'a', label: 'Laptop' },
    ]);
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

describe('fitChips omitting a device', () => {
  it('drops the chip of the selected device only when its fit is green', () => {
    const fits = [
      { deviceId: 'a', deviceName: 'Laptop', status: 'green', reason: '' },
      { deviceId: 'b', deviceName: 'Deck', status: 'yellow', reason: '' },
    ] as const;
    expect(fitChips(fits, 'a')).toEqual([{ label: 'Deck', tone: 'low' }]);
    expect(fitChips(fits, 'b')).toHaveLength(2);
    expect(fitChips(fits, ALL_TAB)).toHaveLength(2);
  });

  it('keeps yellow and unknown chips of the selected device', () => {
    const fits = [
      { deviceId: 'a', deviceName: 'Laptop', status: 'yellow', reason: '' },
      { deviceId: 'b', deviceName: 'PC', status: 'unknown', reason: '' },
    ] as const;
    expect(fitChips(fits, 'a')).toEqual([
      { label: 'Laptop', tone: 'low' },
      { label: 'PC', tone: 'unknown' },
    ]);
    expect(fitChips(fits, 'b')).toHaveLength(2);
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

  it('omits the selected device chip but keeps the others', () => {
    expect(pickChips(rec({ backlog: true }), { omitDeviceId: 'a' })).toEqual([
      { label: 'Backlog', tone: 'unknown', plain: true },
    ]);
  });

  it('keeps the selected device chip and the Deck chip when the selected Deck fit is not green', () => {
    const yellow = rec({
      fits: [{ deviceId: 'a', deviceName: 'Deck', status: 'yellow', reason: '' }],
      deck: 'playable',
    });
    expect(pickChips(yellow, { hasDeckDevice: true, omitDeviceId: 'a' })).toEqual([
      { label: 'Deck', tone: 'low' },
      { label: 'Deck: Playable', tone: 'low' },
    ]);
    const green = rec({
      fits: [{ deviceId: 'a', deviceName: 'Deck', status: 'green', reason: '' }],
      deck: 'verified',
    });
    expect(pickChips(green, { hasDeckDevice: true, omitDeviceId: 'a' })).toEqual([]);
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

describe('platformChips', () => {
  it('lists up to four platforms as plain chips', () => {
    expect(platformChips(['A', 'B']).map((c) => c.label)).toEqual(['A', 'B']);
  });

  it('collapses the rest into +N with the hidden names spoken', () => {
    const names = ['A', 'B', 'C', 'D', 'E', 'F'];
    const chips = platformChips(names);
    expect(chips.map((c) => c.label)).toEqual(['A', 'B', 'C', 'D', '+2']);
    expect(chips.at(-1)?.srLabel).toBe('and 2 more: E, F');
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
