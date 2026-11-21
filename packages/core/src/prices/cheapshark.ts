import { RateQueue } from '../igdb/queue.js';
import {
  pickGameId,
  toPriceInfo,
  type CheapSharkGameDetail,
  type CheapSharkGameRow,
  type CheapSharkStore,
  type PriceLookupGame,
} from './match.js';
import type { PriceInfo } from './schemas.js';

const API = 'https://www.cheapshark.com/api/1.0';

/** CheapShark rejects generic agents; this names the app without naming anyone. */
export const CHEAPSHARK_USER_AGENT = 'Perch/0.1 (+game-discovery-app)';

/** Most lookups waiting on the rate queue at once; further ones are skipped, not queued. */
export const CHEAPSHARK_MAX_QUEUED = 30;

/** Thrown when the queue is full: nothing was looked up, so nothing should be cached. */
export class CheapSharkQueueFullError extends Error {
  constructor() {
    super('CheapShark queue is full');
    this.name = 'CheapSharkQueueFullError';
  }
}

export interface CheapSharkClientOptions {
  fetch?: typeof fetch;
  /** CheapShark has no published limit but asks for politeness (default 1 request a second). */
  maxPerSecond?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  /** Retries of a 429 / 5xx (default 2); a Retry-After pauses the whole queue. */
  retries?: number;
  backoffMs?: number;
  /** Cap on lookups in flight or waiting (default CHEAPSHARK_MAX_QUEUED). */
  maxQueued?: number;
}

export interface CheapSharkClient {
  /**
   * Cheapest current PC-store price and historic low; null when the game is not matched (Steam app
   * id first, then an exact title). Throws on HTTP failure, CheapSharkQueueFullError when too many wait.
   */
  findPrices(game: PriceLookupGame): Promise<PriceInfo | null>;
}

const STORES_TTL_MS = 24 * 60 * 60 * 1000;

export function createCheapSharkClient(opts: CheapSharkClientOptions = {}): CheapSharkClient {
  const doFetch = opts.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const now = opts.now ?? Date.now;
  const queue = new RateQueue(opts.maxPerSecond ?? 1, { now: opts.now, sleep: opts.sleep });
  const retries = opts.retries ?? 2;
  const backoffMs = opts.backoffMs ?? 1000;
  const maxQueued = opts.maxQueued ?? CHEAPSHARK_MAX_QUEUED;
  let queued = 0;

  async function getJson<T>(path: string, params: Record<string, string> = {}): Promise<T> {
    const qs = new URLSearchParams(params).toString();
    const url = `${API}/${path}${qs ? `?${qs}` : ''}`;
    for (let attempt = 0; ; attempt++) {
      const res = await queue.schedule(() =>
        doFetch(url, {
          headers: { accept: 'application/json', 'user-agent': CHEAPSHARK_USER_AGENT },
          signal: AbortSignal.timeout(10_000),
        }),
      );
      if (res.ok) return (await res.json()) as T;
      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable || attempt >= retries) {
        throw new Error(`CheapShark ${path} answered ${res.status}`);
      }
      const retryAfter = Number(res.headers.get('retry-after'));
      queue.pause(retryAfter > 0 ? retryAfter * 1000 : backoffMs * 2 ** attempt);
    }
  }

  const asRows = (body: unknown): CheapSharkGameRow[] => (Array.isArray(body) ? body : []);

  // The store list changes rarely: fetched once a day, and a failure only costs the store names.
  let stores: { list: CheapSharkStore[] | null; at: number } | undefined;
  async function loadStores(): Promise<CheapSharkStore[] | null> {
    if (stores && now() - stores.at < STORES_TTL_MS) return stores.list;
    let list: CheapSharkStore[] | null = null;
    try {
      const body = await getJson<unknown>('stores');
      if (Array.isArray(body)) list = body as CheapSharkStore[];
    } catch (err) {
      console.warn('CheapShark store list unavailable:', err);
    }
    // A failure is remembered for a short while only, so the next lookups do not all retry it.
    stores = { list, at: list ? now() : now() - STORES_TTL_MS + 10 * 60 * 1000 };
    return list;
  }

  async function lookup(game: PriceLookupGame): Promise<PriceInfo | null> {
    let gameId: string | null = null;
    if (game.steamAppId != null) {
      const rows = asRows(await getJson('games', { steamAppID: String(game.steamAppId) }));
      gameId = pickGameId('steam', rows, game);
    }
    if (!gameId) {
      const rows = asRows(await getJson('games', { title: game.name, limit: '10' }));
      gameId = pickGameId('title', rows, game);
    }
    if (!gameId) return null;
    const detail = await getJson<CheapSharkGameDetail>('games', { id: gameId });
    return toPriceInfo(detail ?? {}, await loadStores());
  }

  return {
    async findPrices(game) {
      if (queued >= maxQueued) throw new CheapSharkQueueFullError();
      queued++;
      try {
        return await lookup(game);
      } finally {
        queued--;
      }
    },
  };
}

let shared: CheapSharkClient | undefined;
/** One client per process, so every caller shares the rate queue. */
export function getSharedCheapSharkClient(): CheapSharkClient {
  return (shared ??= createCheapSharkClient());
}
