import { inArray } from 'drizzle-orm';
import { timeToBeat, type Db } from '@perch/db';
import type { TimeToBeat } from './schemas.js';

/** IGDB time-to-beat is a relative signal only: ignore rows with fewer submissions than this. */
export const MIN_TIME_TO_BEAT_COUNT = 5;

export interface TimeToBeatHours {
  hastilyHours: number | null;
  normallyHours: number | null;
  completelyHours: number | null;
  /** How many IGDB submissions the figures rest on (0 when IGDB gives no count). */
  submissions: number;
}

const toHours = (seconds: number | null) =>
  seconds === null ? null : Math.round((seconds / 3600) * 10) / 10;

/** Hours for display; null when there is no usable data. */
export function toTimeToBeatHours(t: TimeToBeat | null): TimeToBeatHours | null {
  if (!t || (t.count !== null && t.count < MIN_TIME_TO_BEAT_COUNT)) return null;
  const hours = {
    hastilyHours: toHours(t.hastilySeconds),
    normallyHours: toHours(t.normallySeconds),
    completelyHours: toHours(t.completelySeconds),
  };
  if (Object.values(hours).every((h) => h === null)) return null;
  return { ...hours, submissions: t.count ?? 0 };
}

/** Time-to-beat already in the DB (never calls IGDB), keyed by IGDB id; games without a row are absent. */
export async function loadTimeToBeat(
  db: Db,
  igdbIds: readonly number[],
): Promise<Map<number, TimeToBeatHours>> {
  const out = new Map<number, TimeToBeatHours>();
  if (igdbIds.length === 0) return out;
  const rows = await db
    .select()
    .from(timeToBeat)
    .where(inArray(timeToBeat.igdbId, [...igdbIds]));
  for (const row of rows) {
    const hours = toTimeToBeatHours(row);
    if (hours) out.set(row.igdbId, hours);
  }
  return out;
}
