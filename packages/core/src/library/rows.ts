import type { games, libraryEntries } from '@perch/db';
import type { Game } from '../igdb/schemas.js';
import type { Status } from './fields.js';

export function buildGameRow(
  game: Game,
  vocab: Record<string, number>,
  now: Date = new Date(),
): typeof games.$inferInsert {
  return { ...game, vocab, fetchedAt: now };
}

export interface LibraryInput {
  userId: string;
  igdbId: number;
  platform: string;
  source: 'manual' | 'import';
  hours?: number;
  lastPlayed?: Date;
  status?: Status;
  owned?: boolean;
}

/**
 * `insert` fills defaults for a new row; `update` carries only the fields the caller
 * provided, so re-adding a game never wipes existing hours/status/owned/source. May be empty.
 */
export function buildLibraryRow(input: LibraryInput): {
  insert: typeof libraryEntries.$inferInsert;
  update: Partial<typeof libraryEntries.$inferInsert>;
} {
  const { userId, igdbId, platform, source, hours, lastPlayed, status, owned } = input;
  const insert: typeof libraryEntries.$inferInsert = {
    userId,
    igdbId,
    platform,
    hoursPlayed: hours ?? null,
    lastPlayed: lastPlayed ?? null,
    status: status ?? 'backlog',
    source,
  };
  // `owned` undefined: DB default on insert, untouched on conflict.
  if (owned !== undefined) insert.owned = owned;
  const update: Partial<typeof libraryEntries.$inferInsert> = {};
  if (hours !== undefined) update.hoursPlayed = hours;
  if (lastPlayed !== undefined) update.lastPlayed = lastPlayed;
  if (status !== undefined) update.status = status;
  if (owned !== undefined) update.owned = owned;
  return { insert, update };
}
