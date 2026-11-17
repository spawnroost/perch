import { and, desc, eq } from 'drizzle-orm';
import { feedback, games, tasteProfiles, type Db } from '@perch/db';
import { GameNotFoundError } from '../library/db.js';
import { buildProfile } from '../engine/profile.js';
import { loadRecommendInput } from '../engine/load.js';
import { mergeLibrary } from '../engine/recommend.js';
import type { FeedbackKind, Vocab } from '../engine/types.js';
import { bumpRecsVersion } from '../recommendation-cache/version.js';
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
  if (!(await cache.getGame(igdbId))) throw new GameNotFoundError(igdbId);
  // `slot` (generated) puts up and down in one slot, so a new vote replaces the old one.
  await db.transaction(async (tx) => {
    await tx
      .insert(feedback)
      .values({ userId, igdbId, kind })
      .onConflictDoUpdate({
        target: [feedback.userId, feedback.igdbId, feedback.slot],
        set: { kind, at: new Date() },
      });
    await bumpRecsVersion(tx, userId);
  });
}

/** Undoes one kind of feedback; a kind that is not set is a no-op (so is a vote of the other way). */
export async function removeFeedback(
  db: Db,
  userId: string,
  igdbId: number,
  kind: FeedbackKind,
): Promise<void> {
  await db.transaction(async (tx) => {
    const gone = await tx
      .delete(feedback)
      .where(and(eq(feedback.userId, userId), eq(feedback.igdbId, igdbId), eq(feedback.kind, kind)))
      .returning({ id: feedback.igdbId });
    if (gone.length > 0) await bumpRecsVersion(tx, userId);
  });
}

/** The user's current feedback: per game, the kind sent most recently. */
export async function listFeedback(db: Db, userId: string): Promise<Record<number, FeedbackKind>> {
  const rows = await db
    .select({ igdbId: feedback.igdbId, kind: feedback.kind })
    .from(feedback)
    .where(eq(feedback.userId, userId))
    .orderBy(desc(feedback.at));
  const out: Record<number, FeedbackKind> = {};
  // Newest first, so the first row seen for a game wins.
  for (const row of rows) out[row.igdbId] ??= row.kind as FeedbackKind;
  return out;
}

/**
 * Builds the user's taste profile (same merged library as `recommend`) from library + feedback and upserts the cached row.
 * `recommend` still computes its own profile live; this row is for other consumers.
 */
export async function rebuildProfile(
  db: Db,
  userId: string,
  now: Date,
  mapVocab: (game: typeof games.$inferSelect) => Vocab,
): Promise<void> {
  const { library, feedback: fb } = await loadRecommendInput(db, userId, mapVocab);
  const profile = buildProfile({ library: mergeLibrary(library), feedback: fb, now });
  const row = { vocab: profile.vocab, genres: profile.genres, builtAt: now };
  await db
    .insert(tasteProfiles)
    .values({ userId, ...row })
    .onConflictDoUpdate({ target: tasteProfiles.userId, set: row });
}
