import { describe, expect, it } from 'vitest';
import {
  STEPS,
  advance,
  back,
  canAdvance,
  parseHours,
  skipDevices,
  stepIndex,
} from '../src/lib/onboarding.js';

describe('onboarding steps', () => {
  it('runs games, devices, picks', () => {
    expect(STEPS).toEqual(['games', 'devices', 'picks']);
    expect(stepIndex('devices')).toBe(1);
  });

  it('needs a game to leave step 1 and a device to leave step 2', () => {
    expect(canAdvance('games', { games: 0, devices: 0 })).toBe(false);
    expect(canAdvance('games', { games: 1, devices: 0 })).toBe(true);
    expect(canAdvance('devices', { games: 3, devices: 0 })).toBe(false);
    expect(canAdvance('devices', { games: 3, devices: 1 })).toBe(true);
    expect(canAdvance('picks', { games: 3, devices: 1 })).toBe(false);
  });

  it('advance moves forward only when allowed', () => {
    expect(advance('games', { games: 0, devices: 0 })).toBe('games');
    expect(advance('games', { games: 2, devices: 0 })).toBe('devices');
    expect(advance('devices', { games: 2, devices: 1 })).toBe('picks');
    expect(advance('picks', { games: 2, devices: 1 })).toBe('picks');
  });

  it('back never leaves the first step', () => {
    expect(back('picks')).toBe('devices');
    expect(back('devices')).toBe('games');
    expect(back('games')).toBe('games');
  });

  it('skipDevices jumps from devices to picks, and only from there', () => {
    expect(skipDevices('devices')).toBe('picks');
    expect(skipDevices('games')).toBe('games');
  });
});

describe('parseHours', () => {
  it('parses plain and decimal hours', () => {
    expect(parseHours('40')).toBe(40);
    expect(parseHours(' 12.5 ')).toBe(12.5);
    expect(parseHours('12,5')).toBe(12.5);
    expect(parseHours('0')).toBe(0);
  });
  it('treats blank as no value', () => {
    expect(parseHours('')).toBeUndefined();
    expect(parseHours('   ')).toBeUndefined();
  });
  it('rejects negatives, junk and absurd values', () => {
    expect(parseHours('-3')).toBeNull();
    expect(parseHours('abc')).toBeNull();
    expect(parseHours('1e3')).toBeNull();
    expect(parseHours('2000000')).toBeNull();
  });
});
