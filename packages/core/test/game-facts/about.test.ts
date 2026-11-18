import { describe, expect, it } from 'vitest';
import {
  buildAbout,
  gameModeNames,
  parseCompanies,
  parseMultiplayer,
  perspectiveNames,
  pickSeriesName,
} from '../../src/game-facts/about.js';
import { toTimeToBeatTiers } from '../../src/igdb/time-to-beat.js';

describe('names for stored ids', () => {
  it('maps game mode ids and drops unknown ones', () => {
    expect(gameModeNames([1, 3, 4, 999])).toEqual([
      'Single player',
      'Co-operative',
      'Split screen',
    ]);
    expect(gameModeNames([])).toEqual([]);
  });
  it('maps perspective ids and drops unknown ones', () => {
    expect(perspectiveNames([2, 1, 7, 999])).toEqual([
      'Third person',
      'First person',
      'Virtual reality',
    ]);
  });
});

describe('parseCompanies', () => {
  it('splits developers and publishers, deduplicated, in IGDB order', () => {
    expect(
      parseCompanies([
        { company: { name: 'Supergiant' }, developer: true, publisher: true },
        { company: { name: 'Sony' }, developer: false, publisher: true },
        { company: { name: 'Supergiant' }, developer: true, publisher: false },
        { company: { name: 'Porting Co' } },
        { developer: true },
      ]),
    ).toEqual({ developers: ['Supergiant'], publishers: ['Supergiant', 'Sony'] });
  });
  it('is empty for undefined', () => {
    expect(parseCompanies(undefined)).toEqual({ developers: [], publishers: [] });
  });
});

describe('parseMultiplayer', () => {
  it('is null with no multiplayer modes', () => {
    expect(parseMultiplayer(undefined)).toBeNull();
    expect(parseMultiplayer([])).toBeNull();
  });
  it('merges the per-platform entries', () => {
    expect(
      parseMultiplayer([
        { campaigncoop: true, onlinecoop: false, onlinecoopmax: 2 },
        { onlinecoop: true, onlinecoopmax: 4, offlinecoop: true, splitscreen: false },
        { splitscreen: true },
      ]),
    ).toEqual({ campaign: true, online: true, onlineMax: 4, local: true, splitscreen: true });
  });
  it('treats missing flags as false and a zero max as unknown', () => {
    expect(parseMultiplayer([{ onlinecoopmax: 0 }])).toEqual({
      campaign: false,
      online: false,
      onlineMax: null,
      local: false,
      splitscreen: false,
    });
  });
});

describe('pickSeriesName', () => {
  it('prefers the collection over the franchise', () => {
    expect(pickSeriesName([{ id: 1, name: 'Hades' }], [{ id: 2, name: 'Greek' }])).toBe('Hades');
    expect(pickSeriesName([], [{ id: 2, name: 'Greek' }])).toBe('Greek');
    expect(pickSeriesName([{ id: 1 }], [{ id: 2, name: 'Greek' }])).toBe('Greek');
    expect(pickSeriesName(undefined, undefined)).toBeNull();
  });
});

describe('buildAbout', () => {
  it('assembles the block from a game', () => {
    expect(
      buildAbout({
        developers: ['Supergiant'],
        publishers: ['Supergiant'],
        gameModes: [1],
        perspectives: [3],
        multiplayer: null,
        dlcCount: 0,
        expansionCount: 2,
        seriesName: 'Hades',
      }),
    ).toEqual({
      developers: ['Supergiant'],
      publishers: ['Supergiant'],
      modes: ['Single player'],
      perspectives: ['Bird view / Isometric'],
      coop: null,
      dlcCount: 0,
      expansionCount: 2,
      series: 'Hades',
    });
  });
});

describe('toTimeToBeatTiers', () => {
  it('maps hastily/normally/completely to story/extras/completionist with the submission count', () => {
    expect(
      toTimeToBeatTiers({
        hastilySeconds: 36000,
        normallySeconds: 55080,
        completelySeconds: 144000,
        count: 12,
      }),
    ).toEqual({ story: 10, extras: 15.3, completionist: 40, submissions: 12 });
  });
  it('is null with no row, too few submissions or no figures', () => {
    expect(toTimeToBeatTiers(null)).toBeNull();
    expect(
      toTimeToBeatTiers({
        hastilySeconds: 3600,
        normallySeconds: null,
        completelySeconds: null,
        count: 2,
      }),
    ).toBeNull();
    expect(
      toTimeToBeatTiers({
        hastilySeconds: null,
        normallySeconds: null,
        completelySeconds: null,
        count: 50,
      }),
    ).toBeNull();
  });
  it('keeps a null count as 0 submissions', () => {
    expect(
      toTimeToBeatTiers({
        hastilySeconds: null,
        normallySeconds: 7200,
        completelySeconds: null,
        count: null,
      }),
    ).toEqual({ story: null, extras: 2, completionist: null, submissions: 0 });
  });
});
