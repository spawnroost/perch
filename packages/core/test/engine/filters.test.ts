import { describe, expect, it } from 'vitest';
import { bestFit, deviceFit, type FilterDevice, type FitRequirements } from '../../src/engine/filters.js';
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
