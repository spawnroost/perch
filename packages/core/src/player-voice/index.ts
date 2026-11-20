import { eq } from 'drizzle-orm';
import { gamePlayerVoice, type Db } from '@perch/db';
import { reserveLlmBatch, DEFAULT_GLOBAL_DAILY_BATCH_CAP } from '../explain/usage.js';
import { getSharedSteamClient, type SteamClient } from '../requirements/steam.js';
import { MIN_VOICE_REVIEWS } from './reviews.js';
import { playerVoiceSchema, type PlayerVoice, type VoiceSummarizer } from './schemas.js';

export {
  MIN_VOICE_REVIEWS,
  parseReviewTexts,
  pickReviews,
  VOICE_MAX_REVIEWS,
  VOICE_MIN_REVIEW_CHARS,
  VOICE_REVIEW_MAX_CHARS,
} from './reviews.js';
export {
  playerVoiceResponseSchema,
  playerVoiceSchema,
  steamReviewsUrl,
  VOICE_MAX_CHARS,
  VOICE_MAX_POINTS,
} from './schemas.js';
export type { PlayerVoice, PlayerVoiceResponse, VoiceReview, VoiceSummarizer } from './schemas.js';
export { cleanVoice, createDeepseekVoiceSummarizer } from './summarize.js';

export const PLAYER_VOICE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** A game with too few reviews, or nothing to say, is looked at again after this. */
export const PLAYER_VOICE_NEGATIVE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Most player-voice batches one user can start per day (the For-you reasons count separately). */
export const VOICE_USER_DAILY_CAP = 50;
/** After a failed fetch or summary the game is left alone this long (memory only). */
export const PLAYER_VOICE_BLOCK_MS = 10 * 60 * 1000;
/** Longest a first lookup is awaited; it continues in the background. */
const DEFAULT_WAIT_MS = 2500;

export interface PlayerVoiceOptions {
  client?: SteamClient;
  /** Null = no LLM configured: nothing is fetched or generated, only stored summaries are served. */
  summarizer: VoiceSummarizer | null;
  globalCap?: number;
  userCap?: number;
  waitMs?: number;
  now?: () => Date;
}

interface Stored {
  voice: PlayerVoice | null;
  fetchedAt: Date;
}

async function load(db: Db, igdbId: number): Promise<Stored | null> {
  const [row] = await db.select().from(gamePlayerVoice).where(eq(gamePlayerVoice.igdbId, igdbId));
  if (!row) return null;
  const parsed = playerVoiceSchema.safeParse(row.payload);
  return { voice: parsed.success ? parsed.data : null, fetchedAt: row.fetchedAt };
}

const isFresh = (s: Stored, now: Date) =>
  now.getTime() - s.fetchedAt.getTime() <
  (s.voice ? PLAYER_VOICE_TTL_MS : PLAYER_VOICE_NEGATIVE_TTL_MS);

/** Only bumps fetched_at, so a stored summary survives a refresh that found nothing new. */
async function touch(db: Db, igdbId: number, fetchedAt: Date) {
  await db.update(gamePlayerVoice).set({ fetchedAt }).where(eq(gamePlayerVoice.igdbId, igdbId));
}

async function save(
  db: Db,
  igdbId: number,
  payload: PlayerVoice | null,
  reviewCount: number,
  fetchedAt: Date,
) {
  await db
    .insert(gamePlayerVoice)
    .values({ igdbId, payload, reviewCount, fetchedAt })
    .onConflictDoUpdate({
      target: gamePlayerVoice.igdbId,
      set: { payload, reviewCount, fetchedAt },
    });
}

/** Games whose last attempt failed, with when; left alone for PLAYER_VOICE_BLOCK_MS. */
const blocked = new Map<number, number>();

/** Forgets every block (tests). */
export function clearPlayerVoiceBlocks(): void {
  blocked.clear();
}

/** Fetches still running, one per game, so overlapping requests share them. */
const inflight = new Map<number, Promise<PlayerVoice | null>>();

/** Resolves when every lookup started here has settled (tests, shutdown). */
export async function playerVoiceIdle(): Promise<void> {
  while (inflight.size > 0) await Promise.allSettled([...inflight.values()]);
}

interface Game {
  igdbId: number;
  name: string;
  steamAppId: number;
}

/**
 * Fetches reviews, summarizes and stores. Failures and a used-up allowance store nothing. A stored
 * summary is never replaced by "none": the refresh only bumps its fetched_at.
 */
async function refresh(
  db: Db,
  game: Game,
  userId: string,
  summarizer: VoiceSummarizer,
  stored: Stored | null,
  opts: PlayerVoiceOptions,
): Promise<PlayerVoice | null> {
  const now = opts.now ?? (() => new Date());
  const keep = stored?.voice ?? null;
  const block = () => {
    const t = now().getTime();
    for (const [id, at] of blocked) if (t - at >= PLAYER_VOICE_BLOCK_MS) blocked.delete(id);
    blocked.set(game.igdbId, t);
  };
  try {
    const client = opts.client ?? getSharedSteamClient();
    const reviews = await client.getReviewTexts(game.steamAppId);
    if (reviews.length < MIN_VOICE_REVIEWS) {
      if (keep) await touch(db, game.igdbId, now());
      else await save(db, game.igdbId, null, reviews.length, now());
      return keep;
    }
    const allowed = await reserveLlmBatch(db, userId, {
      globalCap: opts.globalCap ?? DEFAULT_GLOBAL_DAILY_BATCH_CAP,
      userCap: opts.userCap ?? VOICE_USER_DAILY_CAP,
      now: now(),
      scope: 'voice',
    });
    // A used-up allowance is the user's, not the game's: no block, other users may still try.
    if (!allowed) return keep;
    const voice = await summarizer.summarize(game.name, reviews);
    if (!voice && keep) {
      await touch(db, game.igdbId, now());
      return keep;
    }
    await save(db, game.igdbId, voice, reviews.length, now());
    return voice;
  } catch (err) {
    console.warn(`player voice for game ${game.igdbId} failed:`, err);
    block();
    return keep;
  }
}

/**
 * What Steam players say about a game, from the cache. A stored summary (also a "none" one) past
 * its TTL is served at once and refreshed in the background; with nothing stored the call waits up
 * to `waitMs`, then answers `pending` while the lookup finishes. A lookup spends one LLM batch
 * from the player-voice daily allowance (its own counters, apart from the For-you reasons). Never throws: null on any failure.
 */
export async function playerVoiceLookup(
  db: Db,
  game: { igdbId: number; name: string; steamAppId: number | null },
  userId: string,
  opts: PlayerVoiceOptions,
): Promise<{ voice: PlayerVoice | null; pending: boolean }> {
  const { steamAppId } = game;
  if (!steamAppId) return { voice: null, pending: false };
  const now = (opts.now ?? (() => new Date()))();
  try {
    const stored = await load(db, game.igdbId);
    if (stored && isFresh(stored, now)) return { voice: stored.voice, pending: false };
    const { summarizer } = opts;
    const blockedAt = blocked.get(game.igdbId);
    const isBlocked = blockedAt !== undefined && now.getTime() - blockedAt < PLAYER_VOICE_BLOCK_MS;
    let p = inflight.get(game.igdbId);
    if (!p && summarizer && !isBlocked) {
      const started: Promise<PlayerVoice | null> = refresh(
        db,
        { igdbId: game.igdbId, name: game.name, steamAppId },
        userId,
        summarizer,
        stored,
        opts,
      )
        .catch((err) => {
          console.warn(`player voice for game ${game.igdbId} not stored:`, err);
          return stored?.voice ?? null;
        })
        .finally(() => inflight.delete(game.igdbId));
      inflight.set(game.igdbId, started);
      p = started;
    }
    if (stored || !p) return { voice: stored?.voice ?? null, pending: false };
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timedOut = Symbol('timeout');
    const waited = await Promise.race([
      p,
      new Promise<typeof timedOut>((resolve) => {
        timer = setTimeout(() => resolve(timedOut), opts.waitMs ?? DEFAULT_WAIT_MS);
      }),
    ]);
    clearTimeout(timer);
    return waited === timedOut ? { voice: null, pending: true } : { voice: waited, pending: false };
  } catch (err) {
    console.warn(`player voice for game ${game.igdbId} unavailable:`, err);
    return { voice: null, pending: false };
  }
}
