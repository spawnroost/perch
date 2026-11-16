import { eq } from 'drizzle-orm';
import { feedback, games, libraryEntries, type Db } from '@perch/db';
import type { Status } from '../library/fields.js';
import type { FeedbackItem, LibraryItem, Vocab } from './types.js';

/**
 * Loads a user's library (joined with games) and feedback. Vocab is always computed fresh with
 * `mapVocab`, so a vocab table change never leaves library games on stale stored vectors.
 */
export async function loadRecommendInput(
  db: Db,
  userId: string,
  mapVocab: (game: typeof games.$inferSelect) => Vocab,
): Promise<{ library: LibraryItem[]; feedback: FeedbackItem[] }> {
  const rows = await db
    .select({ entry: libraryEntries, game: games })
    .from(libraryEntries)
    .innerJoin(games, eq(games.igdbId, libraryEntries.igdbId))
    .where(eq(libraryEntries.userId, userId));
  const fb = await db
    .select({ igdbId: feedback.igdbId, kind: feedback.kind })
    .from(feedback)
    .where(eq(feedback.userId, userId));
  return {
    library: rows.map(({ entry, game }) => ({
      game: {
        igdbId: game.igdbId,
        name: game.name,
        firstRelease: game.firstRelease,
        genres: game.genres,
        themes: game.themes,
        similarIds: game.similarIds,
        rating: game.rating,
        ratingCount: game.ratingCount,
        vocab: mapVocab(game),
      },
      hours: entry.hoursPlayed,
      lastPlayed: entry.lastPlayed,
      status: entry.status as Status,
      owned: entry.owned,
    })),
    feedback: fb.map((f) => ({ igdbId: f.igdbId, kind: f.kind as FeedbackItem['kind'] })),
  };
}
