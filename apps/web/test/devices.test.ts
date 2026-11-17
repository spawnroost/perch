import { describe, expect, it } from 'vitest';
import type { DeviceView } from '@perch/core';
import {
  addedKinds,
  canEditHardware,
  hasDeckDevice,
  deviceSummary,
  deviceArtType,
  DEVICE_ART_TYPES,
  deviceType,
} from '../src/lib/devices.js';

function device(over: Partial<DeviceView>): DeviceView {
  return {
    id: 'd',
    kind: 'pc',
    name: 'PC',
    platformIds: [6],
    gpuName: null,
    gpuScore: null,
    cpuName: null,
    cpuScore: null,
    ramGb: null,
    isDefault: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

describe('deviceSummary', () => {
  it('joins gpu, cpu and memory', () => {
    expect(deviceSummary(device({ gpuName: 'RTX 3060', cpuName: 'Ryzen 5 5600', ramGb: 16 }))).toBe(
      'RTX 3060 · Ryzen 5 5600 · 16 GB',
    );
  });
  it('falls back to platform names for consoles', () => {
    expect(deviceSummary(device({ kind: 'ps5', platformIds: [167, 48] }))).toBe(
      'PlayStation 5, PlayStation 4',
    );
  });
});

describe('deviceType', () => {
  it('classifies kinds', () => {
    expect(deviceType('pc')).toBe('PC');
    expect(deviceType('steam-deck')).toBe('Handheld');
    expect(deviceType('mac')).toBe('Mac');
    expect(deviceType('ps5')).toBe('Console');
  });
  it('only PCs have editable hardware', () => {
    expect(canEditHardware(device({ kind: 'pc' }))).toBe(true);
    expect(canEditHardware(device({ kind: 'steam-deck' }))).toBe(false);
  });
});

describe('addedKinds', () => {
  it('collects the kinds already added', () => {
    expect(addedKinds([device({ kind: 'pc' }), device({ kind: 'mac' })])).toEqual(
      new Set(['pc', 'mac']),
    );
  });
});

describe('hasDeckDevice', () => {
  it('is true only when a Steam Deck is among the devices', () => {
    expect(hasDeckDevice([device({ kind: 'pc' }), device({ kind: 'steam-deck' })])).toBe(true);
    expect(hasDeckDevice([device({ kind: 'pc' }), device({ kind: 'rog-ally' })])).toBe(false);
    expect(hasDeckDevice([])).toBe(false);
  });
});

describe('deviceArtType', () => {
  it('maps each preset kind to its illustration', () => {
    expect(deviceArtType('pc')).toBe('desktop');
    expect(deviceArtType('mac')).toBe('laptop');
    expect(deviceArtType('steam-deck')).toBe('handheld');
    expect(deviceArtType('rog-ally')).toBe('handheld');
    expect(deviceArtType('switch')).toBe('hybrid');
    expect(deviceArtType('switch-2')).toBe('hybrid');
    expect(deviceArtType('ps5')).toBe('console-slab');
    expect(deviceArtType('ps4')).toBe('console-slab');
    expect(deviceArtType('xbox-series')).toBe('console-box');
  });
  it('falls back to generic for unknown kinds', () => {
    expect(deviceArtType('some-future-device')).toBe('generic');
    expect(deviceArtType('toString')).toBe('generic');
  });
  it('lists every art type once', () => {
    expect(new Set(DEVICE_ART_TYPES).size).toBe(DEVICE_ART_TYPES.length);
    expect(DEVICE_ART_TYPES).toContain('generic');
  });
});
