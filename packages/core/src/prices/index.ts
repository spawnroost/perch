import { eq } from 'drizzle-orm';
import { gamePrices, type Db } from '@perch/db';
import {
  CheapSharkQueueFullError,
  getSharedCheapSharkClient,
  type CheapSharkClient,
} from './cheapshark.js';
import { priceInfoSchema, type PriceInfo } from './schemas.js';

export {
  CHEAPSHARK_MAX_QUEUED,
  CHEAPSHARK_USER_AGENT,
  CheapSharkQueueFullError,
  createCheapSharkClient,
  getSharedCheapSharkClient,
} from './cheapshark.js';
export type { CheapSharkClient, CheapSharkClientOptions } from './cheapshark.js';
export { pickGameId, toPriceInfo } from './match.js';
export type { PriceLookupGame } from './match.js';
export {
  historicLowSchema,
  priceInfoSchema,
  priceOfferSchema,
  priceResponseSchema,
} from './schemas.js';
export type { HistoricLow, PriceInfo, PriceOffer, PriceResponse } from './schemas.js';

export const PRICES_TTL_MS = 12 * 60 * 60 * 1000;
/** A failed fetch is not retried for this long. */
const FAILURE_RETRY_MS = 30 * 60 * 1000;
/** Longest a first lookup is awaited; the fetch continues in the background. */
const DEFAULT_WAIT_MS = 6000;

export interface PricesOptions {
  client?: CheapSharkClient;
  ttlMs?: number;
  now?: () => Date;
  waitMs?: number;
}

export interface PriceGame {
  igdbId: number;
  name: string;
  steamAppId: number | null;
}

interface Stored {
  prices: PriceInfo | null;
  fetchedAt: Date;
}

async function load(db: Db, igdbId: number): Promise<Stored | null> {
  const [row] = await db.select().from(gamePrices).where(eq(gamePrices.igdbId, igdbId));
  if (!row) return null;
  const parsed = priceInfoSchema.safeParse(row.payload);
  return { prices: parsed.success ? parsed.data : null, fetchedAt: row.fetchedAt };
}

/** Fetches and stores the prices; on failure keeps what was stored and retries only after a while. */
async function refresh(
  db: Db,
  game: PriceGame,
  stored: Stored | null,
  opts: PricesOptions,
): Promise<PriceInfo | null> {
  const { ttlMs = PRICES_TTL_MS, now = () => new Date() } = opts;
  const client = opts.client ?? getSharedCheapSharkClient();
  let found: PriceInfo | null;
  try {
    found = await client.findPrices(game);
  } catch (err) {
    // Nothing was looked up: write nothing, so the next visit tries again.
    if (err instanceof CheapSharkQueueFullError) return stored?.prices ?? null;
    console.warn(`prices for game ${game.igdbId} failed:`, err);
    // Negative cache: back-date the stamp so the row counts as fresh for FAILURE_RETRY_MS only.
    const fetchedAt = new Date(now().getTime() - ttlMs + FAILURE_RETRY_MS);
    await db
      .insert(gamePrices)
      .values({ igdbId: game.igdbId, payload: stored?.prices ?? null, fetchedAt })
      .onConflictDoUpdate({ target: gamePrices.igdbId, set: { fetchedAt } });
    return stored?.prices ?? null;
  }
  const fetchedAt = now();
  const parsed = priceInfoSchema.safeParse(found);
  const payload = parsed.success ? parsed.data : null;
  await db
    .insert(gamePrices)
    .values({ igdbId: game.igdbId, payload, fetchedAt })
    .onConflictDoUpdate({ target: gamePrices.igdbId, set: { payload, fetchedAt } });
  return payload;
}

/** Fetches still running, one per game, so overlapping requests share them. */
const inflight = new Map<number, Promise<PriceInfo | null>>();

/** Resolves when every fetch started here has settled (tests, shutdown). */
export async function pricesIdle(): Promise<void> {
  while (inflight.size > 0) await Promise.allSettled([...inflight.values()]);
}

function startRefresh(db: Db, game: PriceGame, stored: Stored | null, opts: PricesOptions) {
  let p = inflight.get(game.igdbId);
  if (!p) {
    const started: Promise<PriceInfo | null> = refresh(db, game, stored, opts)
      .catch((err) => {
        console.warn(`prices for game ${game.igdbId} not stored:`, err);
        return stored?.prices ?? null;
      })
      .finally(() => inflight.delete(game.igdbId));
    inflight.set(game.igdbId, started);
    p = started;
  }
  return p;
}

/**
 * The game's prices, from the cache. Entries (including "not sold") past the TTL are served at
 * once and refreshed in the background; with nothing stored the call waits up to `waitMs` for the
 * first lookup (through CheapShark's rate queue). `pending` is true when that wait ran out with
 * the lookup still going. Never throws: null on any failure.
 */
export async function pricesLookup(
  db: Db,
  game: PriceGame,
  opts: PricesOptions = {},
): Promise<{ prices: PriceInfo | null; pending: boolean }> {
  const { ttlMs = PRICES_TTL_MS, now = () => new Date() } = opts;
  try {
    const stored = await load(db, game.igdbId);
    if (stored && now().getTime() - stored.fetchedAt.getTime() < ttlMs) {
      return { prices: stored.prices, pending: false };
    }
    const p = startRefresh(db, game, stored, opts);
    if (stored) return { prices: stored.prices, pending: false };
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timedOut = Symbol('timeout');
    const waited = await Promise.race([
      p,
      new Promise<typeof timedOut>((resolve) => {
        timer = setTimeout(() => resolve(timedOut), opts.waitMs ?? DEFAULT_WAIT_MS);
      }),
    ]);
    clearTimeout(timer);
    return waited === timedOut
      ? { prices: null, pending: true }
      : { prices: waited, pending: false };
  } catch (err) {
    console.warn(`prices for game ${game.igdbId} unavailable:`, err);
    return { prices: null, pending: false };
  }
}

/**
 * Prices no older than the TTL, waiting for the refresh when the stored ones are stale (the
 * price-watch job must not announce yesterday's price). Falls back to what is stored on failure.
 */
export async function pricesFresh(
  db: Db,
  game: PriceGame,
  opts: PricesOptions = {},
): Promise<PriceInfo | null> {
  const { ttlMs = PRICES_TTL_MS, now = () => new Date() } = opts;
  try {
    const stored = await load(db, game.igdbId);
    if (stored && now().getTime() - stored.fetchedAt.getTime() < ttlMs) return stored.prices;
    return await startRefresh(db, game, stored, opts);
  } catch (err) {
    console.warn(`prices for game ${game.igdbId} unavailable:`, err);
    return null;
  }
}
