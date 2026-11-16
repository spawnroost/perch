import { describe, expect, it } from 'vitest';
import { DEVICE_PRESETS, getPreset, IGDB_PLATFORM } from '../../src/devices/presets.js';

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

  it('returns undefined for unknown ids', () => {
    expect(getPreset('n64')).toBeUndefined();
  });
});
