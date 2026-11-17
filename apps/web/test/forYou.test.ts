import { describe, expect, it } from 'vitest';
import {
  ALL_TAB,
  BACKLOG_ID,
  MORE_PICKS_ID,
  SHELF_CAP,
  SHORT_SESSIONS_ID,
  SHORT_SESSION_MAX_HOURS,
  SOURCE_SHELF_MIN,
  deviceSearch,
  parseDevice,
  parseShelfKey,
  similarPath,
  shelfPath,
  shelfPicks,
  sourceShelfKey,
  deviceOptions,
  buildShelves,
  capChips,
  cardChips,
  fitChips,
  cardKey,
  layoutOwners,
  parseGameId,
  platformChips,
  pickChips,
  type Recommendation,
  likeMeta,
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

  const many = (source: number, n: number, from: number) =>
    Array.from({ length: n }, (_, i) => pick(from + i, { source }));

  it('groups picks by their source game, in rank order, one shelf per source with 4+ picks', () => {
    const shelves = buildShelves([
      pick(1, { source: 10 }),
      pick(2, { source: 20 }),
      pick(3, { source: 10 }),
      pick(4, { source: 20 }),
      pick(5, { source: 20 }),
      pick(6, { source: 10 }),
      pick(7, { source: 20 }),
      pick(8, { source: 10 }),
    ]);
    expect(shelves.map((s) => s.title)).toEqual([
      'Because you played S10',
      'Because you played S20',
    ]);
    expect(ids(shelves[0]!)).toEqual([1, 3, 6, 8]);
    expect(ids(shelves[1]!)).toEqual([2, 4, 5, 7]);
    expect(shelves[0]!.id).toBe('source-10');
    expect(SOURCE_SHELF_MIN).toBe(4);
  });

  it('orders Because shelves by size, largest first', () => {
    const shelves = buildShelves([...many(10, 4, 1), ...many(20, 5, 10)]);
    expect(shelves.map((s) => s.id)).toEqual(['source-20', 'source-10']);
  });

  it('folds sources with fewer than 4 picks into More picks, in rank order', () => {
    const shelves = buildShelves([
      pick(1, { source: 30 }),
      ...many(10, 4, 2),
      pick(6, { source: 30 }),
      pick(7),
    ]);
    expect(shelves.map((s) => s.id)).toEqual(['source-10', MORE_PICKS_ID]);
    expect(ids(shelves[1]!)).toEqual([1, 6, 7]);
  });

  it('gives each shelf a stable key', () => {
    const picks = [
      ...many(10, 4, 1),
      pick(20, { hours: 2 }),
      pick(21, { hours: 3 }),
      pick(22, { hours: 4 }),
      pick(23, { backlog: true }),
      pick(24),
    ];
    expect(buildShelves(picks).map((s) => s.id)).toEqual(['source-10', 'short', 'backlog', 'more']);
    expect([SHORT_SESSIONS_ID, BACKLOG_ID, MORE_PICKS_ID]).toEqual(['short', 'backlog', 'more']);
    expect(sourceShelfKey(10)).toBe('source-10');
  });

  it('caps a shelf at SHELF_CAP cards, keeps the full total and offers See all', () => {
    const shelves = buildShelves(many(10, SHELF_CAP + 5, 1));
    expect(shelves[0]!.picks).toHaveLength(SHELF_CAP);
    expect(shelves[0]!.total).toBe(SHELF_CAP + 5);
    expect(shelves[0]!.seeAll).toBe(true);
  });

  it('does not let cards cut by the cap spill onto More picks', () => {
    const shelves = buildShelves(many(10, SHELF_CAP + 2, 1));
    expect(shelves.map((s) => s.id)).toEqual(['source-10']);
  });

  it('offers See all only when a shelf is over the cap', () => {
    const picks = [
      ...many(10, 4, 1),
      pick(20, { backlog: true }),
      ...Array.from({ length: SHELF_CAP + 1 }, (_, i) => pick(100 + i)),
    ];
    const by = Object.fromEntries(buildShelves(picks).map((s) => [s.id, s]));
    expect(by['source-10']!.seeAll).toBe(false);
    expect(by[BACKLOG_ID]!.seeAll).toBe(false);
    expect(by[MORE_PICKS_ID]!.seeAll).toBe(true);
    expect(by[MORE_PICKS_ID]!.total).toBe(SHELF_CAP + 1);
  });

  it('lets a caller lift the cap', () => {
    const shelves = buildShelves(many(10, SHELF_CAP + 5, 1), null, Infinity);
    expect(shelves[0]!.picks).toHaveLength(SHELF_CAP + 5);
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
      ...many(10, 4, 5),
    ];
    const shelves = buildShelves(picks);
    expect(Object.fromEntries(shelves.map((s) => [s.id, ids(s)]))).toEqual({
      'source-10': [5, 6, 7, 8],
      [SHORT_SESSIONS_ID]: [2, 3, 4],
      [BACKLOG_ID]: [1],
    });
    const all = shelves.flatMap(ids);
    expect(new Set(all).size).toBe(all.length);
  });

  it('keeps the hero game off every shelf', () => {
    const shelves = buildShelves(many(10, 5, 1), 1);
    expect(shelves.flatMap(ids)).toEqual([2, 3, 4, 5]);
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

  it('lists every platform when expanded', () => {
    const names = ['A', 'B', 'C', 'D', 'E', 'F'];
    expect(platformChips(names, true).map((c) => c.label)).toEqual(names);
  });
});

describe('layoutOwners', () => {
  const p = (igdbId: number) => ({ game: { igdbId } }) as unknown as Recommendation;

  it('gives each game one shared-element owner: its first card in shelf order', () => {
    const owners = layoutOwners([
      { id: 'all', picks: [p(1), p(2)] },
      { id: 'pc', picks: [p(2), p(3)] },
    ]);
    expect([...owners]).toEqual([cardKey('all', 1), cardKey('all', 2), cardKey('pc', 3)]);
  });
});

describe('shelf keys', () => {
  it('accepts only the known key shapes', () => {
    for (const ok of ['backlog', 'short', 'more', 'source-10', 'source-1942']) {
      expect(parseShelfKey(ok)).toBe(ok);
    }
    for (const bad of [
      undefined,
      '',
      'source-',
      'source-0',
      'source-01',
      'source-007',
      'source-x',
      'because-10',
      'all',
      'source-1.5',
    ]) {
      expect(parseShelfKey(bad)).toBeNull();
    }
  });

  it('builds the See all path, carrying the device unless it is All', () => {
    expect(shelfPath('source-10', ALL_TAB)).toBe('/for-you/source-10');
    expect(shelfPath('short', 'dev 1')).toBe('/for-you/short?device=dev%201');
  });

  it('serialises and parses the device param, empty meaning All', () => {
    expect(deviceSearch(ALL_TAB)).toBe('');
    expect(deviceSearch('dev 1')).toBe('?device=dev%201');
    expect(parseDevice(null)).toBe(ALL_TAB);
    expect(parseDevice('')).toBe(ALL_TAB);
    expect(parseDevice('dev 1')).toBe('dev 1');
    expect(parseDevice(new URLSearchParams(deviceSearch('a&b=c')).get('device'))).toBe('a&b=c');
  });
});

describe('shelfPicks', () => {
  const pick = (igdbId: number, source: number | null = null) =>
    ({
      game: { igdbId, name: `G${igdbId}` },
      sourceGame: source === null ? null : { igdbId: source, name: 'S' },
      backlog: false,
      fits: [],
      timeToBeat: null,
    }) as unknown as Recommendation;

  it('returns every pick for a key, uncapped, with its title', () => {
    const feed = Array.from({ length: SHELF_CAP + 8 }, (_, i) => pick(i + 1, 10));
    const shelf = shelfPicks(feed, 'source-10');
    expect(shelf!.title).toBe('Because you played S');
    expect(shelf!.picks).toHaveLength(SHELF_CAP + 8);
  });

  it('leaves the hero out, like the launcher shelf', () => {
    const feed = [pick(1, 10), pick(2, 10), pick(3, 10), pick(4, 10), pick(5, 10)];
    expect(shelfPicks(feed, 'source-10', 1)!.picks.map((r) => r.game.igdbId)).toEqual([2, 3, 4, 5]);
  });

  it('is null when the feed has nothing for the key', () => {
    expect(shelfPicks([pick(1)], 'backlog')).toBeNull();
    expect(shelfPicks([], 'more')).toBeNull();
  });
});

describe('cardChips', () => {
  const fit = (deviceId: string, status: 'green' | 'yellow') =>
    ({ deviceId, deviceName: deviceId, status }) as never;
  const dev = (id: string, kind: string) => ({ id, name: id, kind }) as never;

  it('drops the selected device green chip and caps the rest', () => {
    const rec = {
      fits: [fit('pc', 'green'), fit('deck', 'yellow'), fit('ps5', 'yellow')],
      backlog: true,
      deck: null,
    };
    const chips = cardChips(rec, [dev('pc', 'pc'), dev('deck', 'steam-deck')], 'pc');
    expect(chips.map((c) => c.label)).toEqual(['deck', 'ps5', '+1']);
  });

  it('treats an unknown selection as All', () => {
    const rec = { fits: [fit('pc', 'green')], backlog: false, deck: null };
    expect(cardChips(rec, [dev('pc', 'pc')], 'all').map((c) => c.label)).toEqual(['pc']);
    expect(cardChips(rec, [dev('pc', 'pc')], 'gone').map((c) => c.label)).toEqual(['pc']);
  });
});

describe('similarPath', () => {
  it('routes to the More like this grid; the device rides along unless it is All', () => {
    expect(similarPath(42, ALL_TAB)).toBe('/for-you/like/42');
    expect(similarPath(42, 'dev 1')).toBe('/for-you/like/42?device=dev%201');
  });
});

describe('likeMeta', () => {
  it('keeps only the shared tags after the seed name, even when the name has a colon', () => {
    expect(likeMeta('Like Hades II: Roguelike, Mythology', 'Hades II')).toBe(
      'Roguelike, Mythology',
    );
    expect(
      likeMeta('Like Middle-earth: Shadow of Mordor: Open world', 'Middle-earth: Shadow of Mordor'),
    ).toBe('Open world');
  });

  it('returns undefined when there are no shared tags or the reason is for another seed', () => {
    expect(likeMeta('Like Hades II', 'Hades II')).toBeUndefined();
    expect(likeMeta('Similar to Hades: Roguelike', 'Hades II')).toBeUndefined();
  });
});
