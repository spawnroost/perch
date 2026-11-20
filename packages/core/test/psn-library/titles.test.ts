import { describe, expect, it } from 'vitest';
import {
  cleanPsnTitle,
  cleanXboxTitle,
  parseIsoDurationMinutes,
  psnPlatform,
  stripTrademarks,
  toPsnTitles,
} from '../../src/index.js';

describe('stripTrademarks', () => {
  it('drops (R)(TM)(C) signs and tidies spaces; shared by the Xbox and PSN cleaners', () => {
    expect(stripTrademarks('  Mass Effect™   Legendary® Edition © ')).toBe(
      'Mass Effect Legendary Edition',
    );
    expect(cleanXboxTitle('Battlefield™')).toBe('Battlefield');
  });
});

describe('cleanPsnTitle', () => {
  it.each([
    ['Mass Effect™ Legendary Edition', 'Mass Effect Legendary Edition'],
    ['Rocket League®', 'Rocket League'],
    ['Hades (PS4)', 'Hades'],
    ['Control (PS5™)', 'Control'],
    ['Persona 5 Royal', 'Persona 5 Royal'],
    ['Ps Vita Adventures', 'Ps Vita Adventures'],
  ])('%s -> %s', (raw, clean) => {
    expect(cleanPsnTitle(raw)).toBe(clean);
  });
});

describe('psnPlatform', () => {
  it('maps the PSN category to a platform, null for anything that is not a game', () => {
    expect(psnPlatform('ps4_game')).toBe('ps4');
    expect(psnPlatform('ps5_native_game')).toBe('ps5');
    expect(psnPlatform('ps5_native_media_app')).toBeNull();
    expect(psnPlatform('pspc_game')).toBeNull();
    expect(psnPlatform(undefined)).toBeNull();
  });
});

describe('parseIsoDurationMinutes', () => {
  it.each([
    ['PT132H48M23S', 132 * 60 + 48],
    ['PT45M', 45],
    ['PT2H', 120],
    ['PT30S', 1],
    ['PT10S', 0],
    ['P1DT1H', 25 * 60],
    ['PT0S', 0],
    ['garbage', 0],
    ['', 0],
  ])('%s -> %i', (raw, minutes) => {
    expect(parseIsoDurationMinutes(raw)).toBe(minutes);
  });
  it('treats missing values as zero', () => {
    expect(parseIsoDurationMinutes(undefined)).toBe(0);
    expect(parseIsoDurationMinutes(null)).toBe(0);
  });
});

describe('toPsnTitles', () => {
  it('keeps PS4/PS5 games only, with cleaned names, minutes and last-played', () => {
    const out = toPsnTitles([
      {
        titleId: 'PPSA01325_00',
        name: 'Mass Effect™ Legendary Edition',
        category: 'ps5_native_game',
        playDuration: 'PT132H48M23S',
        lastPlayedDateTime: '2026-11-19T05:05:23.232Z',
      },
      { titleId: 'CUSA1_00', name: 'Hades', category: 'ps4_game', playDuration: 'PT5M' },
      { titleId: 'PPSA2_00', name: 'Netflix', category: 'ps5_native_media_app' },
      { titleId: 'X', name: '™', category: 'ps4_game' },
      { titleId: 'CUSA3_00', name: 'Bad Date', category: 'ps4_game', lastPlayedDateTime: 'nope' },
    ]);
    expect(out.map((t) => t.name)).toEqual(['Mass Effect Legendary Edition', 'Hades', 'Bad Date']);
    expect(out[0]).toMatchObject({ platform: 'ps5', minutes: 132 * 60 + 48 });
    expect(out[0]!.lastPlayed?.toISOString()).toBe('2026-11-19T05:05:23.232Z');
    expect(out[1]).toMatchObject({ platform: 'ps4', minutes: 5, lastPlayed: null });
    expect(out[2]).toMatchObject({ minutes: 0, lastPlayed: null });
  });
});
