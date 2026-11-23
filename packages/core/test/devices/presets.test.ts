import { describe, expect, it } from 'vitest';
import { DEVICE_PRESETS, getPreset, IGDB_PLATFORM } from '../../src/devices/presets.js';
import { matchCpu, matchGpu } from '../../src/hardware/tiers.js';

describe('device presets', () => {
  it('has unique ids', () => {
    const ids = DEVICE_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every preset plays at least one platform', () => {
    for (const p of DEVICE_PRESETS) expect(p.platformIds.length).toBeGreaterThan(0);
  });

  it('consoles include backward-compatible platforms', () => {
    expect(getPreset('ps5')?.platformIds).toEqual([IGDB_PLATFORM.ps5, IGDB_PLATFORM.ps4]);
    expect(getPreset('switch-2')?.platformIds).toContain(IGDB_PLATFORM.switch);
    expect(getPreset('xbox-series')?.platformIds).toContain(IGDB_PLATFORM.xboxOne);
  });

  it('steam deck is a PC with deck compat and fixed hardware', () => {
    const deck = getPreset('steam-deck');
    expect(deck?.platformIds).toEqual([IGDB_PLATFORM.windows]);
    expect(deck?.deckCompat).toBe(true);
    expect(deck?.hardware?.gpuName).toBeTruthy();
    expect(deck?.hardware?.ramGb).toBe(16);
  });

  it('has iOS and Android phone and tablet presets without hardware', () => {
    expect(IGDB_PLATFORM.ios).toBe(39);
    expect(IGDB_PLATFORM.android).toBe(34);
    const want: [string, number, 'phone' | 'tablet'][] = [
      ['iphone', IGDB_PLATFORM.ios, 'phone'],
      ['ipad', IGDB_PLATFORM.ios, 'tablet'],
      ['android-phone', IGDB_PLATFORM.android, 'phone'],
      ['android-tablet', IGDB_PLATFORM.android, 'tablet'],
    ];
    for (const [id, platform, form] of want) {
      const p = getPreset(id);
      expect(p?.platformIds, id).toEqual([platform]);
      expect(p?.form, id).toBe(form);
      expect(p?.hardware, id).toBeUndefined();
    }
    expect(getPreset('iphone')?.name).toBe('iPhone');
    expect(getPreset('android-tablet')?.name).toBe('Android tablet');
  });

  it('returns undefined for unknown ids', () => {
    expect(getPreset('n64')).toBeUndefined();
  });

  it('preset hardware resolves to tier scores', () => {
    for (const p of DEVICE_PRESETS) {
      if (!p.hardware) continue;
      expect(matchGpu(p.hardware.gpuName), `${p.id} gpu`).not.toBeNull();
      expect(matchCpu(p.hardware.cpuName), `${p.id} cpu`).not.toBeNull();
    }
  });
});
