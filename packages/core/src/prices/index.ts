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
/** A failed lookup is not retried for this long. */
const FAILURE_RETRY_MS = 60 * 1000;
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

/** What a lookup found; `ok` is false when it could not be done (queue full, HTTP error, timeout). */
interface Outcome {
  prices: PriceInfo | null;
  ok: boolean;
}

/** Games whose last lookup failed, and when: not retried for FAILURE_RETRY_MS (this process only). */
const failedAt = new Map<number, number>();

/**
 * Fetches and stores the prices. A confirmed "no match" is stored (negative cache); a failure
 * stores nothing, so it never reads as "not sold": stored prices stay as they were and the
 * lookup is retried after a short pause.
 */
async function refresh(
  db: Db,
  game: PriceGame,
  stored: Stored | null,
  opts: PricesOptions,
): Promise<Outcome> {
  const { now = () => new Date() } = opts;
  const client = opts.client ?? getSharedCheapSharkClient();
  const unavailable: Outcome = { prices: stored?.prices ?? null, ok: false };
  const failedRecently = failedAt.get(game.igdbId);
  if (failedRecently !== undefined && now().getTime() - failedRecently < FAILURE_RETRY_MS) {
    return unavailable;
  }
  let found: PriceInfo | null;
  try {
    found = await client.findPrices(game);
  } catch (err) {
    // A full queue is load, not a verdict on the game: no pause, just not looked up now.
    if (!(err instanceof CheapSharkQueueFullError)) {
      console.warn(`prices for game ${game.igdbId} failed:`, err);
      failedAt.set(game.igdbId, now().getTime());
    }
    return unavailable;
  }
  failedAt.delete(game.igdbId);
  const fetchedAt = now();
  const parsed = priceInfoSchema.safeParse(found);
  const payload = parsed.success ? parsed.data : null;
  await db
    .insert(gamePrices)
    .values({ igdbId: game.igdbId, payload, fetchedAt })
    .onConflictDoUpdate({ target: gamePrices.igdbId, set: { payload, fetchedAt } });
  return { prices: payload, ok: true };
}

/** Fetches still running, one per game, so overlapping requests share them. */
const inflight = new Map<number, Promise<Outcome>>();

/** Forgets recorded failures (tests). */
export function resetPriceFailures(): void {
  failedAt.clear();
}

/** Resolves when every fetch started here has settled (tests, shutdown). */
export async function pricesIdle(): Promise<void> {
  while (inflight.size > 0) await Promise.allSettled([...inflight.values()]);
}

function startRefresh(
  db: Db,
  game: PriceGame,
  stored: Stored | null,
  opts: PricesOptions,
): Promise<Outcome> {
  let p = inflight.get(game.igdbId);
  if (!p) {
    const started: Promise<Outcome> = refresh(db, game, stored, opts)
      .catch((err) => {
        console.warn(`prices for game ${game.igdbId} not stored:`, err);
        return { prices: stored?.prices ?? null, ok: false };
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
 * first lookup (through CheapShark's rate queue). `pending` is true when nothing is known yet:
 * the wait ran out, or the lookup failed (nothing is cached then, so asking again retries it).
 * Never throws.
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
    return waited === timedOut || !waited.ok
      ? { prices: null, pending: true }
      : { prices: waited.prices, pending: false };
  } catch (err) {
    console.warn(`prices for game ${game.igdbId} unavailable:`, err);
    return { prices: null, pending: true };
  }
}

/**
 * Prices no older than the TTL, waiting for the refresh when the stored ones are stale (the
 * price-watch job must not announce yesterday's price). `stale` is true when the refresh failed:
 * `prices` is then whatever was stored (or null) and must not be acted on.
 */
export async function pricesFresh(
  db: Db,
  game: PriceGame,
  opts: PricesOptions = {},
): Promise<{ prices: PriceInfo | null; stale: boolean }> {
  const { ttlMs = PRICES_TTL_MS, now = () => new Date() } = opts;
  try {
    const stored = await load(db, game.igdbId);
    if (stored && now().getTime() - stored.fetchedAt.getTime() < ttlMs) {
      return { prices: stored.prices, stale: false };
    }
    const { prices, ok } = await startRefresh(db, game, stored, opts);
    return { prices, stale: !ok };
  } catch (err) {
    console.warn(`prices for game ${game.igdbId} unavailable:`, err);
    return { prices: null, stale: true };
  }
}
