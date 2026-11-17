import { describe, expect, it } from 'vitest';
import type { DeviceView } from '@perch/core';
import { addedKinds, canEditHardware, deviceSummary, deviceType } from '../src/lib/devices.js';

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
