import { describe, expect, it } from 'vitest';
import {
  batteryMatters,
  isBatteryAwareKind,
  rankForSession,
  type SessionRec,
} from '../../src/engine/session.js';
import type { TimeToBeatHours } from '../../src/igdb/time-to-beat.js';
import { game } from './fixtures.js';

let n = 0;
function rec(over: Partial<SessionRec> & { vocab?: Record<string, number> } = {}): SessionRec {
  const { vocab, ...rest } = over;
  n += 1;
  return {
    rank: n,
    game: game(n, `Game ${n}`, vocab ?? {}),
    score: 1,
    backlog: false,
    reason: 'Because you played X',
    sourceGame: null,
    timeToBeat: null,
    fits: [{ deviceId: 'd1', status: 'green' }],
    gpuRequirement: null,
    ...rest,
  };
}
const ttb = (hastily: number | null, normally: number | null): TimeToBeatHours => ({
  hastilyHours: hastily,
  normallyHours: normally,
  completelyHours: null,
  submissions: 5,
});
const pc = { id: 'd1', kind: 'pc', gpuScore: 10000 };
const deck = { id: 'd1', kind: 'steam-deck', gpuScore: 5600 };

describe('rankForSession', () => {
  it('boosts a game that fits the session over a long one, when scores tie', () => {
    const short = rec({ timeToBeat: ttb(0.4, 0.5) });
    const long = rec({ timeToBeat: ttb(40, 60) });
    const out = rankForSession([long, short], { minutes: 40, device: pc });
    expect(out.map((r) => r.game.igdbId)).toEqual([short.game.igdbId, long.game.igdbId]);
    expect(out[0]!.sessionReason).toBe('Beatable now');
    expect(out.map((r) => r.rank)).toEqual([1, 2]);
  });

  it('treats unknown time-to-beat as neutral', () => {
    const unknown = rec({ score: 1 });
    const known = rec({ score: 1, timeToBeat: ttb(0.4, 0.5) });
    const [first] = rankForSession([unknown, known], { minutes: 30, device: pc });
    expect(first!.game.igdbId).toBe(known.game.igdbId);
    const out = rankForSession([unknown], { minutes: 30, device: pc });
    expect(out[0]!.sessionReason).toBe('A fit for 30 min');
  });

  it('boosts pick-up-and-play tags in short sessions only', () => {
    const plain = rec({ vocab: { 'open-world': 1 } });
    const run = rec({ vocab: { roguelike: 1 } });
    const short = rankForSession([plain, run], { minutes: 30, device: pc });
    expect(short[0]!.game.igdbId).toBe(run.game.igdbId);
    expect(short[0]!.sessionReason).toBe('Short runs');
    const long = rankForSession([plain, run], { minutes: 180, device: pc });
    expect(long.map((r) => r.game.igdbId)).toEqual([plain.game.igdbId, run.game.igdbId]);
  });

  it('boosts the backlog once: rank.ts already adds its bonus', () => {
    const plain = rec({ score: 1 });
    const backlog = rec({ score: 1, backlog: true });
    // Same score and no session fit: nothing extra for the backlog, so the better rank wins.
    const out = rankForSession([plain, backlog], { minutes: 120, device: pc });
    expect(out.map((r) => r.game.igdbId)).toEqual([plain.game.igdbId, backlog.game.igdbId]);
    expect(out[1]!.sessionReason).toBe('Waiting in your backlog');
  });

  it('keeps boosts raising and penalties lowering when the score is negative', () => {
    const base = rec({ score: -1 });
    const boosted = rec({ score: -1, timeToBeat: ttb(0.4, 0.5) });
    const lowered = rec({ score: -1, gpuRequirement: 5000 });
    const out = rankForSession([base, lowered, boosted], {
      minutes: 40,
      batteryPct: 30,
      device: deck,
    });
    expect(out.map((r) => r.game.igdbId)).toEqual([
      boosted.game.igdbId,
      base.game.igdbId,
      lowered.game.igdbId,
    ]);
  });

  it('prefers normally over hastily hours, and treats zero hours as unknown', () => {
    const reason = (t: TimeToBeatHours) =>
      rankForSession([rec({ timeToBeat: t })], { minutes: 30, device: pc })[0]!.sessionReason;
    // hastily fits 30 min but normally (2 h) does not: normally wins.
    expect(reason(ttb(0.4, 2))).toBe('A fit for 30 min');
    expect(reason(ttb(0.4, null))).toBe('Beatable now');
    // zero is unknown, not "finishable in any session".
    expect(reason(ttb(0, 0))).toBe('A fit for 30 min');
    expect(reason(ttb(0, 0.4))).toBe('Beatable now');
  });

  it('on a handheld below 40% battery, penalises heavy games and says so for light ones', () => {
    const heavy = rec({ gpuRequirement: 5000 });
    const light = rec({ gpuRequirement: 1500 });
    const out = rankForSession([heavy, light], { minutes: 60, batteryPct: 30, device: deck });
    expect(out[0]!.game.igdbId).toBe(light.game.igdbId);
    expect(out[0]!.sessionReason).toBe('Battery-light');
    expect(out[1]!.sessionReason).not.toBe('Battery-light');
  });

  it('ignores battery on desktops, at 40% or more, or when unknown', () => {
    const heavy = rec({ gpuRequirement: 5000 });
    const light = rec({ gpuRequirement: 1500 });
    for (const opts of [
      { minutes: 60, batteryPct: 20, device: pc },
      { minutes: 60, batteryPct: 40, device: deck },
      { minutes: 60, device: deck },
    ]) {
      const out = rankForSession([heavy, light], opts);
      expect(out.map((r) => r.game.igdbId)).toEqual([heavy.game.igdbId, light.game.igdbId]);
    }
  });

  it('works without a device and does not mutate its input', () => {
    const a = rec({ score: 2 });
    const b = rec({ score: 1 });
    const input = [b, a];
    const out = rankForSession(input, { minutes: 20, device: null });
    expect(out.map((r) => r.game.igdbId)).toEqual([a.game.igdbId, b.game.igdbId]);
    expect(input[0]).toBe(b);
    expect(input[0]).not.toHaveProperty('sessionReason');
  });
});

describe('isBatteryAwareKind / batteryMatters', () => {
  it('is true only for PC handheld kinds', () => {
    expect(isBatteryAwareKind('steam-deck')).toBe(true);
    expect(isBatteryAwareKind('rog-ally')).toBe(true);
    for (const k of ['iphone', 'ipad', 'android-phone', 'android-tablet'])
      expect(isBatteryAwareKind(k), k).toBe(true);
    expect(isBatteryAwareKind('pc')).toBe(false);
    expect(isBatteryAwareKind('switch')).toBe(false);
  });
  it('matters only below 40% on a battery-aware device', () => {
    expect(batteryMatters(deck, 30)).toBe(true);
    expect(batteryMatters(deck, 40)).toBe(false);
    expect(batteryMatters(deck, undefined)).toBe(false);
    expect(batteryMatters(pc, 10)).toBe(false);
    expect(batteryMatters(null, 10)).toBe(false);
  });
});
