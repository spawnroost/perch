import { z } from 'zod';
import type { Status } from './fields.js';

/** Under an hour is a try-out, not "played before". */
export const PLAYED_BEFORE_MIN_MINUTES = 60;

/** A newly imported game the user has played before but not lately: ask what it should be. */
export const playedBeforeSchema = z.object({
  entryId: z.string(),
  title: z.string(),
  /** Null when the source has no playtime (Xbox). */
  minutes: z.number().nullable(),
  /** ISO date-time. */
  lastPlayed: z.string().nullable(),
});
export type PlayedBefore = z.infer<typeof playedBeforeSchema>;

/**
 * True for a backlog import with real history. With minutes (Steam, export files): an hour or
 * more. Without (Xbox): a last-played date and some achievement progress. Recently played games
 * are already `playing`, so they never qualify.
 */
export function isPlayedBefore({
  status,
  minutes,
  lastPlayed,
  achievementProgress,
}: {
  status: Status;
  minutes?: number;
  lastPlayed: Date | null;
  achievementProgress?: number;
}): boolean {
  if (status !== 'backlog') return false;
  if (minutes !== undefined) return minutes >= PLAYED_BEFORE_MIN_MINUTES;
  return lastPlayed !== null && (achievementProgress ?? 0) > 0;
}

export interface PlayedBeforeCandidate {
  title: string;
  minutes: number | null;
  lastPlayed: Date | null;
}

/**
 * The newly created entries (not the ones that already existed) that are candidates, keyed
 * `${igdbId}:${platform}`, most played first.
 */
export function collectPlayedBefore(
  created: readonly { id: string; igdbId: number; platform: string }[],
  candidates: ReadonlyMap<string, PlayedBeforeCandidate>,
): PlayedBefore[] {
  const out: PlayedBefore[] = [];
  for (const c of created) {
    const cand = candidates.get(`${c.igdbId}:${c.platform}`);
    if (!cand) continue;
    out.push({
      entryId: c.id,
      title: cand.title,
      minutes: cand.minutes,
      lastPlayed: cand.lastPlayed?.toISOString() ?? null,
    });
  }
  return out.sort(
    (a, b) => (b.minutes ?? -1) - (a.minutes ?? -1) || a.title.localeCompare(b.title),
  );
}
