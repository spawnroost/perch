import type { TimeToBeatHours } from '../igdb/time-to-beat.js';
import type { FitStatus } from './filters.js';
import type { Recommendation } from './types.js';

/** What the session ranking reads of a recommendation (a `UserRecommendation` has all of it). */
export type SessionRec = Recommendation & {
  timeToBeat: TimeToBeatHours | null;
  fits: readonly { deviceId: string; status: FitStatus }[];
  /** GPU score the game wants (recommended, else minimum); null when unknown. */
  gpuRequirement?: number | null;
};

export interface SessionDevice {
  id: string;
  /** 'pc' or a preset id. */
  kind: string;
  gpuScore: number | null;
}

export interface SessionOptions {
  minutes: number;
  /** Only matters on a handheld. */
  batteryPct?: number;
  device: SessionDevice | null;
}

/** PC handheld kinds, where low battery makes GPU-heavy games a poor pick (not every battery device). */
const BATTERY_AWARE_KINDS = new Set(['steam-deck', 'rog-ally']);
const LOW_BATTERY_PCT = 40;

/** True for kinds where battery level changes the ranking. */
export const isBatteryAwareKind = (kind: string) => BATTERY_AWARE_KINDS.has(kind);
/** A game wanting more than this share of the device's GPU is heavy on battery. */
const HEAVY_GPU_SHARE = 0.7;
/** Vocab tags of games played in short runs (the taste vocab has no arcade tag). */
const PICK_UP_AND_PLAY = ['roguelike', 'puzzle', 'platformer'] as const;
/** Sessions at or below this many minutes favour short-run games and punish epics. */
const SHORT_SESSION_MIN = 60;

/** Floor for the magnitude an adjustment scales, so a boost still moves a zero score. */
const MIN_SCALE = 0.05;

export type SessionRanked<T extends SessionRec> = T & { sessionReason: string };

interface Fit {
  factor: number;
  reason: string | null;
}

function lengthFit(ttb: TimeToBeatHours | null, minutes: number): Fit {
  // Normally is the honest figure; hastily is the fallback. Zero or less means "not known".
  const hours = [ttb?.normallyHours, ttb?.hastilyHours].find((h) => h != null && h > 0) ?? null;
  if (hours === null) return { factor: 1, reason: null };
  const needed = hours * 60;
  if (needed <= minutes) return { factor: 1.3, reason: 'Beatable now' };
  if (needed <= minutes * 6) return { factor: 1.1, reason: null };
  return { factor: minutes <= SHORT_SESSION_MIN ? 0.85 : 1, reason: null };
}

function runFit(rec: SessionRec, minutes: number): Fit {
  if (minutes > SHORT_SESSION_MIN) return { factor: 1, reason: null };
  const strength = Math.max(0, ...PICK_UP_AND_PLAY.map((t) => rec.game.vocab[t] ?? 0));
  return strength > 0
    ? { factor: 1 + 0.25 * strength, reason: 'Short runs' }
    : { factor: 1, reason: null };
}

/** True when battery is low on a handheld, so heavy games should be avoided. */
export function batteryMatters(device: SessionDevice | null, batteryPct: number | undefined) {
  return (
    device !== null &&
    batteryPct !== undefined &&
    batteryPct < LOW_BATTERY_PCT &&
    isBatteryAwareKind(device.kind)
  );
}

/** Null when battery does not matter here or the game's needs are unknown; else whether it is light. */
function lightOnBattery(rec: SessionRec, opts: SessionOptions): boolean | null {
  const { device, batteryPct } = opts;
  if (!device || !batteryMatters(device, batteryPct)) return null;
  const need = rec.gpuRequirement ?? null;
  if (need === null || !device.gpuScore) return null;
  return need <= HEAVY_GPU_SHARE * device.gpuScore;
}

/**
 * Re-ranks recommendations for a play session: base score adjusted for the session length and
 * pick-up-and-play tags (short sessions), and on a handheld below 40% battery heavy games are
 * penalised. The backlog is already boosted in the base score. Callers pass picks already
 * filtered for the device. Pure; returns new objects, best first, each with a `sessionReason`.
 */
export function rankForSession<T extends SessionRec>(
  recs: readonly T[],
  opts: SessionOptions,
): SessionRanked<T>[] {
  const { minutes } = opts;
  return recs
    .map((rec) => {
      const run = runFit(rec, minutes);
      const length = lengthFit(rec.timeToBeat, minutes);
      const light = lightOnBattery(rec, opts);
      const factor = run.factor * length.factor * (light === false ? 0.7 : 1);
      const sessionReason =
        (light === true ? 'Battery-light' : null) ??
        run.reason ??
        length.reason ??
        (rec.backlog ? 'Waiting in your backlog' : null) ??
        `A fit for ${minutes} min`;
      // Additive on the score's magnitude, so a boost raises and a penalty lowers even when the
      // base score is negative (multiplying would flip both).
      const sessionScore = rec.score + Math.max(Math.abs(rec.score), MIN_SCALE) * (factor - 1);
      return { rec, sessionScore, sessionReason };
    })
    .sort((a, b) => b.sessionScore - a.sessionScore || a.rec.rank - b.rec.rank)
    .map(({ rec, sessionReason }, i) => ({ ...rec, rank: i + 1, sessionReason }));
}
