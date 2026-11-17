import { describe, expect, it } from 'vitest';
import type { DeviceView } from '@perch/core';
import {
  capSession,
  sessionDevice,
  sessionParams,
  sessionTitle,
  SESSION_MINUTES,
  SESSION_RESULT_CAP,
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
  it('finds the picked device', () => {
    expect(sessionDevice([pc, deck], 'deck1')).toBe(deck);
  });
  it('has no default: nothing picked, or a pick that is gone, is undefined', () => {
    expect(sessionDevice([pc, deck], undefined)).toBeUndefined();
    expect(sessionDevice([pc, deck], 'gone')).toBeUndefined();
    expect(sessionDevice([], 'pc1')).toBeUndefined();
  });
});

describe('capSession', () => {
  it('keeps at most SESSION_RESULT_CAP picks', () => {
    const many = Array.from({ length: 20 }, (_, i) => i);
    expect(SESSION_RESULT_CAP).toBe(12);
    expect(capSession(many)).toEqual(many.slice(0, 12));
    expect(capSession([1, 2])).toEqual([1, 2]);
  });
});

describe('sessionTitle', () => {
  it('names the minutes and device of the query', () => {
    expect(sessionTitle({ minutes: 60, deviceId: 'd' }, 'Deck')).toBe('Fits 60 min on Deck');
  });
});

describe('sessionParams', () => {
  it('sends minutes and the device id, never a battery', () => {
    expect(sessionParams({ minutes: 30, device: deck })).toEqual({
      minutes: 30,
      deviceId: 'deck1',
    });
  });
  it('is null without a device', () => {
    expect(sessionParams({ minutes: 30, device: undefined })).toBeNull();
  });
});
