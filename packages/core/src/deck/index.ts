import { eq } from 'drizzle-orm';
import { deckCompat, type Db } from '@perch/db';
import {
  getSharedSteamClient,
  SteamError,
  type DeckCategory,
  type SteamClient,
} from '../requirements/steam.js';

export const DECK_COMPAT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface GetDeckCategoryOptions {
  client?: SteamClient;
  ttlMs?: number;
  now?: () => Date;
}

/** The cached Deck category whatever its age; never fetches. 'unknown' when none. */
export async function peekDeckCategory(db: Db, steamAppId: number): Promise<DeckCategory> {
  const [row] = await db.select().from(deckCompat).where(eq(deckCompat.steamAppId, steamAppId));
  return (row?.category as DeckCategory | undefined) ?? 'unknown';
}

/**
 * Steam Deck category for a Steam app: the cached row if fresher than the TTL, else fetched and
 * upserted. If a refetch fails, the stale row is kept and returned; with no row an HTTP failure
 * throws, and an unreadable answer yields 'unknown' without caching it.
 */
export async function getDeckCategory(
  db: Db,
  steamAppId: number,
  opts: GetDeckCategoryOptions = {},
): Promise<DeckCategory> {
  const { ttlMs = DECK_COMPAT_TTL_MS, now = () => new Date() } = opts;
  const [cached] = await db.select().from(deckCompat).where(eq(deckCompat.steamAppId, steamAppId));
  if (cached && now().getTime() - cached.checkedAt.getTime() < ttlMs) {
    return cached.category as DeckCategory;
  }

  const client = opts.client ?? getSharedSteamClient();
  let category: DeckCategory;
  try {
    category = await client.getDeckCompat(steamAppId);
  } catch (err) {
    if (cached) return cached.category as DeckCategory;
    if (err instanceof SteamError && err.kind === 'body') return 'unknown';
    throw err;
  }
  const values = { category, checkedAt: now() };
  await db
    .insert(deckCompat)
    .values({ steamAppId, ...values })
    .onConflictDoUpdate({ target: deckCompat.steamAppId, set: values });
  return category;
}
