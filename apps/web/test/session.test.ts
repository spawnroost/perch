import { describe, expect, it } from 'vitest';
import type { DeviceView } from '@perch/core';
import {
  batteryPercent,
  readBatteryPercent,
  sessionDevice,
  sessionParams,
  showBattery,
  SESSION_MINUTES,
} from '../src/lib/session.js';

function device(over: Partial<DeviceView>): DeviceView {
  return {
    id: 'd',
    kind: 'pc',
    name: 'PC',
    isDefault: false,
    ...over,
  } as DeviceView;
}

const pc = device({ id: 'pc1', name: 'Desktop', isDefault: true });
const deck = device({ id: 'deck1', kind: 'steam-deck', name: 'Deck' });

describe('SESSION_MINUTES', () => {
  it('offers the four chips', () => {
    expect(SESSION_MINUTES).toEqual([15, 30, 60, 120]);
  });
});

describe('sessionDevice', () => {
  it('uses the picked device', () => {
    expect(sessionDevice([pc, deck], 'deck1')).toBe(deck);
  });
  it('uses the default device on All', () => {
    expect(sessionDevice([deck, pc], 'all')).toBe(pc);
  });
  it('falls back to the first device when none is default', () => {
    expect(sessionDevice([deck], 'all')).toBe(deck);
  });
  it('falls back to the default when the picked device is gone', () => {
    expect(sessionDevice([pc, deck], 'gone')).toBe(pc);
  });
  it('is undefined with no devices', () => {
    expect(sessionDevice([], 'all')).toBeUndefined();
  });
});

describe('showBattery', () => {
  it('only for handhelds', () => {
    expect(showBattery(deck)).toBe(true);
    expect(showBattery(device({ kind: 'rog-ally' }))).toBe(true);
    expect(showBattery(pc)).toBe(false);
    expect(showBattery(undefined)).toBe(false);
  });
});

describe('batteryPercent', () => {
  it('rounds a 0-1 level to a percent', () => {
    expect(batteryPercent(0.554)).toBe(55);
    expect(batteryPercent(1)).toBe(100);
    expect(batteryPercent(0)).toBe(0);
  });
  it('clamps and rejects junk', () => {
    expect(batteryPercent(1.4)).toBe(100);
    expect(batteryPercent(-1)).toBe(0);
    expect(batteryPercent(Number.NaN)).toBeUndefined();
  });
});

describe('readBatteryPercent', () => {
  it('reads navigator.getBattery', async () => {
    const nav = { getBattery: () => Promise.resolve({ level: 0.42 }) };
    expect(await readBatteryPercent(nav)).toBe(42);
  });
  it('is undefined when unsupported or failing', async () => {
    expect(await readBatteryPercent({})).toBeUndefined();
    expect(await readBatteryPercent({ getBattery: () => Promise.reject(new Error('no')) })).toBe(
      undefined,
    );
  });
});

describe('sessionParams', () => {
  it('sends battery for a handheld', () => {
    expect(sessionParams({ minutes: 30, battery: 55, device: deck })).toEqual({
      minutes: 30,
      battery: 55,
      deviceId: 'deck1',
    });
  });
  it('drops battery for a desktop and when unknown', () => {
    expect(sessionParams({ minutes: 60, battery: 55, device: pc })).toEqual({
      minutes: 60,
      deviceId: 'pc1',
    });
    expect(sessionParams({ minutes: 15, battery: undefined, device: deck })).toEqual({
      minutes: 15,
      deviceId: 'deck1',
    });
  });
  it('is null without a device', () => {
    expect(sessionParams({ minutes: 30, device: undefined })).toBeNull();
  });
});
