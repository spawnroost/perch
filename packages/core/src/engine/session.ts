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

/** Device kinds that run on a battery. */
const HANDHELD_KINDS = new Set(['steam-deck', 'rog-ally']);
const LOW_BATTERY_PCT = 40;
/** A game wanting more than this share of the device's GPU is heavy on battery. */
const HEAVY_GPU_SHARE = 0.7;
/** Vocab tags of games played in short runs (the taste vocab has no arcade tag). */
const PICK_UP_AND_PLAY = ['roguelike', 'puzzle', 'platformer'] as const;
/** Sessions at or below this many minutes favour short-run games and punish epics. */
const SHORT_SESSION_MIN = 60;

export type SessionRanked<T extends SessionRec> = T & { sessionReason: string };

interface Fit {
  factor: number;
  reason: string | null;
}

function lengthFit(ttb: TimeToBeatHours | null, minutes: number): Fit {
  const hours = ttb?.hastilyHours ?? ttb?.normallyHours ?? null;
  if (hours === null) return { factor: 1, reason: null };
  const needed = hours * 60;
  if (needed <= minutes) return { factor: 1.3, reason: `Finishable in ${minutes} min` };
  if (needed <= minutes * 6) return { factor: 1.1, reason: null };
  return { factor: minutes <= SHORT_SESSION_MIN ? 0.85 : 1, reason: null };
}

function runFit(rec: SessionRec, minutes: number): Fit {
  if (minutes > SHORT_SESSION_MIN) return { factor: 1, reason: null };
  const strength = Math.max(0, ...PICK_UP_AND_PLAY.map((t) => rec.game.vocab[t] ?? 0));
  return strength > 0
    ? { factor: 1 + 0.25 * strength, reason: `Runs fit in ${minutes} min` }
    : { factor: 1, reason: null };
}

/** True when battery is low on a handheld, so heavy games should be avoided. */
export function batteryMatters(device: SessionDevice | null, batteryPct: number | undefined) {
  return (
    device !== null &&
    batteryPct !== undefined &&
    batteryPct < LOW_BATTERY_PCT &&
    HANDHELD_KINDS.has(device.kind)
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
 * Re-ranks recommendations for a play session: base score x fit for the session length x
 * pick-up-and-play tags (short sessions) x backlog boost, red-fit games dropped, and on a
 * handheld below 40% battery heavy games are penalised. Pure; returns new objects, best first,
 * each with a `sessionReason`.
 */
export function rankForSession<T extends SessionRec>(
  recs: readonly T[],
  opts: SessionOptions,
): SessionRanked<T>[] {
  const { minutes, device } = opts;
  return recs
    .filter((r) => !device || r.fits.find((f) => f.deviceId === device.id)?.status !== 'hidden')
    .map((rec) => {
      const run = runFit(rec, minutes);
      const length = lengthFit(rec.timeToBeat, minutes);
      const light = lightOnBattery(rec, opts);
      const factor =
        run.factor * length.factor * (rec.backlog ? 1.2 : 1) * (light === false ? 0.7 : 1);
      const sessionReason =
        (light === true ? 'Light on battery' : null) ??
        run.reason ??
        length.reason ??
        (rec.backlog ? 'Waiting in your backlog' : null) ??
        `A fit for ${minutes} min`;
      return { rec, sessionScore: rec.score * factor, sessionReason };
    })
    .sort((a, b) => b.sessionScore - a.sessionScore || a.rec.rank - b.rec.rank)
    .map(({ rec, sessionReason }, i) => ({ ...rec, rank: i + 1, sessionReason }));
}
