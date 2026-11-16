import { and, eq, inArray } from 'drizzle-orm';
import { feedback, games, tasteProfiles, type Db } from '@perch/db';
import { buildProfile } from '../engine/profile.js';
import { loadRecommendInput } from '../engine/load.js';
import type { FeedbackKind, Vocab } from '../engine/types.js';
import type { IgdbCache } from '../igdb/cache.js';

export interface AddFeedbackDeps {
  db: Db;
  /** Only `getGame` is used: it fetches from IGDB on a miss and upserts into `games`. */
  cache: Pick<IgdbCache, 'getGame'>;
}

/**
 * Records feedback. The game is fetched into the games cache first (the feedback FK needs it).
 * - 'up' / 'down': one vote per game. A new vote replaces any earlier up or down, so switching
 *   or repeating never stacks (the profile adds +1 / -1 per row).
 * - 'played' / 'not_interested': flags, not votes. Kept alongside a vote, stored once each
 *   (repeating refreshes the timestamp).
 */
export async function addFeedback(
  { db, cache }: AddFeedbackDeps,
  userId: string,
  igdbId: number,
  kind: FeedbackKind,
): Promise<void> {
  if (!(await cache.getGame(igdbId))) throw new Error(`IGDB has no game with id ${igdbId}`);
  const replaced = kind === 'up' || kind === 'down' ? (['up', 'down'] as const) : ([kind] as const);
  await db.transaction(async (tx) => {
    await tx
      .delete(feedback)
      .where(
        and(
          eq(feedback.userId, userId),
          eq(feedback.igdbId, igdbId),
          inArray(feedback.kind, [...replaced]),
        ),
      );
    await tx.insert(feedback).values({ userId, igdbId, kind });
  });
}

/**
 * Builds the user's taste profile from library + feedback and upserts the cached row.
 * `recommend` still computes its own profile live; this row is for other consumers.
 */
export async function rebuildProfile(
  db: Db,
  userId: string,
  now: Date,
  mapVocab: (game: typeof games.$inferSelect) => Vocab,
): Promise<void> {
  const { library, feedback: fb } = await loadRecommendInput(db, userId, mapVocab);
  const profile = buildProfile({ library, feedback: fb, now });
  const row = { vocab: profile.vocab, genres: profile.genres, builtAt: now };
  await db
    .insert(tasteProfiles)
    .values({ userId, ...row })
    .onConflictDoUpdate({ target: tasteProfiles.userId, set: row });
}
