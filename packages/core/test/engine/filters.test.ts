import { describe, expect, it } from 'vitest';
import {
  bestFit,
  deviceFit,
  deviceFitDetail,
  deviceKind,
  type FilterDevice,
  type FitRequirements,
} from '../../src/engine/filters.js';
import { IGDB_PLATFORM as P } from '../../src/devices/presets.js';

const pcGame = { platforms: [P.windows, P.ps5] };
const req = (r: Partial<FitRequirements>): FitRequirements => ({
  minGpuScore: null,
  minCpuScore: null,
  minRamGb: null,
  recGpuScore: null,
  recCpuScore: null,
  recRamGb: null,
  ...r,
});
const pc = (o: Partial<FilterDevice> = {}): FilterDevice => ({
  id: 'pc1',
  kind: 'pc',
  platformIds: [P.windows],
  gpuScore: 5000,
  cpuScore: 5000,
  ramGb: 16,
  ...o,
});
const console_ = (id: string, kind: string, platformIds: number[]): FilterDevice => ({
  id,
  kind,
  platformIds,
  gpuScore: null,
  cpuScore: null,
  ramGb: null,
});
const full = req({
  minGpuScore: 2000,
  minCpuScore: 2000,
  minRamGb: 8,
  recGpuScore: 4000,
  recCpuScore: 4000,
  recRamGb: 16,
});

describe('deviceFit: platform', () => {
  it('hides a game whose platforms the device does not play', () => {
    expect(deviceFit({ platforms: [P.ps5] }, pc(), { requirements: full })).toBe('hidden');
  });
  it('console with a platform match is green, mismatch is hidden', () => {
    const ps5 = console_('d', 'ps5', [P.ps5, P.ps4]);
    expect(deviceFit(pcGame, ps5, {})).toBe('green');
    const sw = console_('s', 'switch', [P.switch]);
    expect(deviceFit(pcGame, sw, {})).toBe('hidden');
  });
});

describe('deviceFit: PC', () => {
  it('green at or above rec on every dimension', () => {
    expect(deviceFit(pcGame, pc(), { requirements: full })).toBe('green');
  });
  it('yellow when between min and rec', () => {
    expect(deviceFit(pcGame, pc({ gpuScore: 3000 }), { requirements: full })).toBe('yellow');
  });
  it('hidden below min on any dimension (worst wins)', () => {
    expect(deviceFit(pcGame, pc({ ramGb: 4 }), { requirements: full })).toBe('hidden');
  });
  it('meeting min is green when there is no rec', () => {
    const r = req({ minGpuScore: 2000, minCpuScore: 2000, minRamGb: 8 });
    expect(deviceFit(pcGame, pc({ gpuScore: 2000 }), { requirements: r })).toBe('green');
    expect(deviceFit(pcGame, pc({ gpuScore: 1999 }), { requirements: r })).toBe('hidden');
  });
  it('skips dimensions with a null requirement', () => {
    const r = req({ minGpuScore: 2000, recGpuScore: 4000 });
    expect(deviceFit(pcGame, pc({ cpuScore: 1, ramGb: 1 }), { requirements: r })).toBe('green');
  });
  it('skips dimensions where the device score is null', () => {
    expect(deviceFit(pcGame, pc({ gpuScore: null, cpuScore: null }), { requirements: full })).toBe(
      'green',
    );
  });
  it('is unknown with no requirements, all-null requirements, or all-null device scores', () => {
    expect(deviceFit(pcGame, pc(), {})).toBe('unknown');
    expect(deviceFit(pcGame, pc(), { requirements: null })).toBe('unknown');
    expect(deviceFit(pcGame, pc(), { requirements: req({}) })).toBe('unknown');
    const blank = pc({ gpuScore: null, cpuScore: null, ramGb: null });
    expect(deviceFit(pcGame, blank, { requirements: full })).toBe('unknown');
  });
  it('a low-end PC makes an AAA pick yellow or hidden', () => {
    const aaa = req({
      minGpuScore: 8000,
      minCpuScore: 6000,
      minRamGb: 16,
      recGpuScore: 14000,
      recCpuScore: 10000,
      recRamGb: 16,
    });
    const low = pc({ gpuScore: 9000, cpuScore: 7000, ramGb: 16 });
    expect(deviceFit(pcGame, low, { requirements: aaa })).toBe('yellow');
    const lower = pc({ gpuScore: 3000, cpuScore: 3000, ramGb: 8 });
    expect(deviceFit(pcGame, lower, { requirements: aaa })).toBe('hidden');
  });
});

describe('deviceFit: Steam Deck', () => {
  const deck = console_('deck', 'steam-deck', [P.windows]);
  it('maps the compatibility category', () => {
    expect(deviceFit(pcGame, deck, { deck: 'verified' })).toBe('green');
    expect(deviceFit(pcGame, deck, { deck: 'playable' })).toBe('yellow');
    expect(deviceFit(pcGame, deck, { deck: 'unknown' })).toBe('unknown');
    expect(deviceFit(pcGame, deck, {})).toBe('unknown');
    expect(deviceFit(pcGame, deck, { deck: 'unsupported' })).toBe('hidden');
  });
  it('allowUnsupported turns unsupported into yellow', () => {
    expect(deviceFit(pcGame, deck, { deck: 'unsupported' }, { allowUnsupported: true })).toBe(
      'yellow',
    );
  });
  it('still hides a platform mismatch', () => {
    expect(deviceFit({ platforms: [P.ps5] }, deck, { deck: 'verified' })).toBe('hidden');
  });
});

describe('bestFit', () => {
  const deck = console_('deck', 'steam-deck', [P.windows]);
  const ps5 = console_('ps5', 'ps5', [P.ps5]);
  it('returns the best status and its device', () => {
    const r = bestFit(pcGame, [pc({ gpuScore: 3000 }), deck], () => ({
      requirements: full,
      deck: 'verified',
    }));
    expect(r).toEqual({ status: 'green', deviceId: 'deck' });
  });
  it('prefers yellow over unknown and hidden, first device on ties', () => {
    const r = bestFit({ platforms: [P.windows] }, [ps5, pc(), deck], (d) =>
      d.id === 'pc1' ? { requirements: req({ minGpuScore: 1, recGpuScore: 99999 }) } : {},
    );
    expect(r).toEqual({ status: 'yellow', deviceId: 'pc1' });
  });
  it('is hidden when every device hides it', () => {
    expect(bestFit({ platforms: [P.switch] }, [ps5, pc()], () => ({}))).toEqual({
      status: 'hidden',
      deviceId: 'ps5',
    });
  });
});

describe('deviceFitDetail', () => {
  it('agrees with deviceFit and always gives a reason', () => {
    const cases: [
      Parameters<typeof deviceFit>[0],
      FilterDevice,
      Parameters<typeof deviceFit>[2],
    ][] = [
      [pcGame, pc(), { requirements: full }],
      [pcGame, pc({ gpuScore: 3000 }), { requirements: full }],
      [pcGame, pc({ ramGb: 4 }), { requirements: full }],
      [pcGame, pc(), {}],
      [{ platforms: [P.ps5] }, pc(), {}],
      [pcGame, console_('d', 'ps5', [P.ps5]), {}],
      [pcGame, console_('d', 'steam-deck', [P.windows]), { deck: 'playable' }],
    ];
    for (const [g, d, info] of cases) {
      const detail = deviceFitDetail(g, d, info);
      expect(detail.status).toBe(deviceFit(g, d, info));
      expect(detail.reason.length).toBeGreaterThan(0);
    }
  });
  it('names the platform mismatch', () => {
    expect(deviceFitDetail({ platforms: [P.ps5] }, pc(), {}).reason).toBe(
      'Not released on this device',
    );
  });
  it('names the PC dimensions that fall short', () => {
    expect(deviceFitDetail(pcGame, pc({ ramGb: 4 }), { requirements: full }).reason).toBe(
      'RAM is below the minimum',
    );
    expect(
      deviceFitDetail(pcGame, pc({ gpuScore: 3000, cpuScore: 3000 }), { requirements: full })
        .reason,
    ).toBe('GPU and CPU are below the recommended specs');
    expect(deviceFitDetail(pcGame, pc(), { requirements: full }).reason).toBe(
      'Meets the recommended specs',
    );
    const minOnly = req({ minGpuScore: 2000 });
    expect(deviceFitDetail(pcGame, pc(), { requirements: minOnly }).reason).toBe(
      'Meets the minimum specs',
    );
  });
  it('explains unknown PC fits', () => {
    expect(deviceFitDetail(pcGame, pc(), {}).reason).toBe('No system requirements found');
    expect(deviceFitDetail(pcGame, pc(), { requirements: req({}) }).reason).toBe(
      'Not enough data to compare',
    );
  });
  it('explains the Steam Deck category', () => {
    const deck = console_('d', 'steam-deck', [P.windows]);
    expect(deviceFitDetail(pcGame, deck, { deck: 'verified' }).reason).toBe('Steam Deck Verified');
    expect(deviceFitDetail(pcGame, deck, { deck: 'playable' }).reason).toBe(
      'Playable on Steam Deck with some tweaks',
    );
    expect(deviceFitDetail(pcGame, deck, { deck: 'unsupported' }).reason).toBe(
      'Steam Deck Unsupported',
    );
    expect(deviceFitDetail(pcGame, deck, {}).reason).toBe('No Steam Deck rating yet');
  });
});

describe('mobile devices', () => {
  const iphone = console_('m1', 'iphone', [P.ios]);
  const androidTablet = console_('m2', 'android-tablet', [P.android]);
  it('deviceKind tells phones and tablets apart', () => {
    expect(deviceKind({ kind: 'iphone' })).toBe('phone');
    expect(deviceKind({ kind: 'android-phone' })).toBe('phone');
    expect(deviceKind({ kind: 'ipad' })).toBe('tablet');
    expect(deviceKind({ kind: 'android-tablet' })).toBe('tablet');
    expect(deviceKind({ kind: 'ps5' })).toBe('console');
    expect(deviceKind({ kind: 'steam-deck' })).toBe('deck');
    expect(deviceKind({ kind: 'pc' })).toBe('pc');
  });
  it('fit is platform-only, green with the store named', () => {
    const game = { platforms: [P.ios, P.android] };
    expect(deviceFitDetail(game, iphone, {})).toEqual({
      status: 'green',
      reason: 'Available on iOS',
    });
    expect(deviceFitDetail({ platforms: [P.android] }, androidTablet, {})).toEqual({
      status: 'green',
      reason: 'Available on Android',
    });
  });
  it('hides a game not released on the platform', () => {
    expect(deviceFitDetail({ platforms: [P.windows] }, iphone, {})).toEqual({
      status: 'hidden',
      reason: 'Not released on this device',
    });
    expect(deviceFit({ platforms: [P.android] }, iphone, {})).toBe('hidden');
  });
});
