import { eq } from 'drizzle-orm';
import { gameSoundtracks, type Db } from '@perch/db';
import { getSharedItunesClient, type ItunesClient } from './itunes.js';
import { soundtrackSchema, type Soundtrack } from './schemas.js';

export { createItunesClient, getSharedItunesClient } from './itunes.js';
export type { ItunesClient, ItunesClientOptions } from './itunes.js';
export { normalizeTitle, pickAlbum, soundtrackLinks, toSoundtrack } from './match.js';
export {
  SOUNDTRACK_MAX_TRACKS,
  soundtrackLinksSchema,
  soundtrackResponseSchema,
  soundtrackSchema,
  soundtrackTrackSchema,
} from './schemas.js';
export type {
  Soundtrack,
  SoundtrackLinks,
  SoundtrackResponse,
  SoundtrackTrack,
} from './schemas.js';

export const SOUNDTRACK_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** A failed fetch is not retried for this long. */
const FAILURE_RETRY_MS = 6 * 60 * 60 * 1000;
/** Longest a first lookup is awaited; the fetch continues in the background. */
const DEFAULT_WAIT_MS = 8000;

export interface SoundtrackOptions {
  client?: ItunesClient;
  ttlMs?: number;
  now?: () => Date;
  waitMs?: number;
}

interface Stored {
  soundtrack: Soundtrack | null;
  fetchedAt: Date;
}

async function load(db: Db, igdbId: number): Promise<Stored | null> {
  const [row] = await db.select().from(gameSoundtracks).where(eq(gameSoundtracks.igdbId, igdbId));
  if (!row) return null;
  const parsed = soundtrackSchema.safeParse(row.payload);
  return { soundtrack: parsed.success ? parsed.data : null, fetchedAt: row.fetchedAt };
}

/** Fetches and stores the album; on failure keeps what was stored and retries only after a while. */
async function refresh(
  db: Db,
  game: { igdbId: number; name: string },
  stored: Stored | null,
  opts: SoundtrackOptions,
): Promise<Soundtrack | null> {
  const { ttlMs = SOUNDTRACK_TTL_MS, now = () => new Date() } = opts;
  const client = opts.client ?? getSharedItunesClient();
  let found: Soundtrack | null;
  try {
    found = await client.findSoundtrack(game.name);
  } catch (err) {
    console.warn(`soundtrack for game ${game.igdbId} failed:`, err);
    // Negative cache: back-date the stamp so the row counts as fresh for FAILURE_RETRY_MS only.
    const fetchedAt = new Date(now().getTime() - ttlMs + FAILURE_RETRY_MS);
    await db
      .insert(gameSoundtracks)
      .values({ igdbId: game.igdbId, payload: null, fetchedAt })
      .onConflictDoUpdate({ target: gameSoundtracks.igdbId, set: { fetchedAt } });
    return stored?.soundtrack ?? null;
  }
  const fetchedAt = now();
  await db
    .insert(gameSoundtracks)
    .values({ igdbId: game.igdbId, payload: found, fetchedAt })
    .onConflictDoUpdate({ target: gameSoundtracks.igdbId, set: { payload: found, fetchedAt } });
  return found;
}

/** Fetches still running, one per game, so overlapping requests share them. */
const inflight = new Map<number, Promise<Soundtrack | null>>();

/** Resolves when every fetch started here has settled (tests, shutdown). */
export async function soundtrackIdle(): Promise<void> {
  while (inflight.size > 0) await Promise.allSettled([...inflight.values()]);
}

/**
 * The game's soundtrack album, from the cache. Entries (including "no match") past the TTL are
 * served at once and refreshed in the background; with nothing stored the call waits up to
 * `waitMs` for the first lookup (through iTunes' rate queue). Never throws: null on any failure.
 */
export async function soundtrackFor(
  db: Db,
  game: { igdbId: number; name: string },
  opts: SoundtrackOptions = {},
): Promise<Soundtrack | null> {
  const { ttlMs = SOUNDTRACK_TTL_MS, now = () => new Date() } = opts;
  try {
    const stored = await load(db, game.igdbId);
    if (stored && now().getTime() - stored.fetchedAt.getTime() < ttlMs) return stored.soundtrack;
    let p = inflight.get(game.igdbId);
    if (!p) {
      const started: Promise<Soundtrack | null> = refresh(db, game, stored, opts)
        .catch((err) => {
          console.warn(`soundtrack for game ${game.igdbId} not stored:`, err);
          return stored?.soundtrack ?? null;
        })
        .finally(() => inflight.delete(game.igdbId));
      inflight.set(game.igdbId, started);
      p = started;
    }
    if (stored) return stored.soundtrack;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const waited = await Promise.race([
      p,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), opts.waitMs ?? DEFAULT_WAIT_MS);
      }),
    ]);
    clearTimeout(timer);
    return waited;
  } catch (err) {
    console.warn(`soundtrack for game ${game.igdbId} unavailable:`, err);
    return null;
  }
}
