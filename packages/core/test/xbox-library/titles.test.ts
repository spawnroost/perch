import { describe, expect, it } from 'vitest';
import { cleanXboxTitle, toXboxTitles, xboxPlatform } from '../../src/index.js';

describe('cleanXboxTitle', () => {
  it.each([
    ['Dishonored® Definitive Edition (PC)', 'Dishonored Definitive Edition'],
    ['Goat Simulator Windows 10', 'Goat Simulator'],
    ['Gears of War: Ultimate Edition for Windows 10', 'Gears of War: Ultimate Edition'],
    ['Metal: Hellsinger (Xbox Series X|S & PC)', 'Metal: Hellsinger'],
    ['Halo: The Master Chief Collection', 'Halo: The Master Chief Collection'],
    ['Battlefield™', 'Battlefield'],
    ['Forza Horizon 4 - Windows 10', 'Forza Horizon 4'],
    ['Quantum Break (Xbox One) (Windows 10)', 'Quantum Break'],
    ['  Spaced   Out ©  ', 'Spaced Out'],
    ['Windows 10 Edition Minecraft', 'Windows 10 Edition Minecraft'],
  ])('%s -> %s', (raw, clean) => {
    expect(cleanXboxTitle(raw)).toBe(clean);
  });
});

describe('xboxPlatform', () => {
  it('is xbox when any Xbox console is listed, pc otherwise', () => {
    expect(xboxPlatform(['XboxSeries'])).toBe('xbox');
    expect(xboxPlatform(['PC', 'XboxOne'])).toBe('xbox');
    expect(xboxPlatform(['PC'])).toBe('pc');
    expect(xboxPlatform(['Win32'])).toBe('pc');
    expect(xboxPlatform(null)).toBe('pc');
  });
});

describe('toXboxTitles', () => {
  it('keeps visible games only and parses long fractional timestamps', () => {
    const out = toXboxTitles([
      {
        titleId: '1',
        name: 'Hades®',
        type: 'Game',
        devices: ['XboxSeries'],
        titleHistory: { lastTimePlayed: '2026-11-19T05:05:23.2326524Z', visible: true },
      },
      { titleId: '2', name: 'Netflix', type: 'App', devices: ['XboxSeries'] },
      { titleId: '3', name: 'Hidden', type: 'Game', titleHistory: { visible: false } },
      { titleId: '4', name: '®', type: 'Game' },
      { titleId: '5', name: 'Bad Date', type: 'Game', titleHistory: { lastTimePlayed: 'nope' } },
    ]);
    expect(out.map((t) => t.name)).toEqual(['Hades', 'Bad Date']);
    expect(out[0]).toMatchObject({ platform: 'xbox' });
    expect(out[0]!.lastPlayed?.toISOString()).toBe('2026-11-19T05:05:23.232Z');
    expect(out[1]).toMatchObject({ platform: 'pc', lastPlayed: null });
  });
});
