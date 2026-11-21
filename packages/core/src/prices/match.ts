import { normalizeTitle } from '../soundtrack/match.js';
import { priceInfoSchema, type PriceInfo } from './schemas.js';

/** Where CheapShark sends a visitor for a deal. */
const REDIRECT = 'https://www.cheapshark.com/redirect?dealID=';

/** A row of a CheapShark `games?title=` / `games?steamAppID=` search. */
export interface CheapSharkGameRow {
  gameID?: string;
  steamAppID?: string | null;
  external?: string;
}

export interface CheapSharkStore {
  storeID: string;
  storeName: string;
  isActive?: number;
}

/** The fields of a CheapShark `games?id=` answer that pricing reads. */
export interface CheapSharkGameDetail {
  cheapestPriceEver?: { price?: string; date?: number } | null;
  deals?: {
    storeID?: string;
    dealID?: string;
    price?: string;
    retailPrice?: string;
    savings?: string;
  }[];
}

export interface PriceLookupGame {
  name: string;
  steamAppId: number | null;
}

/**
 * The CheapShark game id for a search result: the row with the game's Steam app id, or (for the
 * title search) the single row whose title is the same words. Never a fuzzy match: null instead.
 */
export function pickGameId(
  by: 'steam' | 'title',
  rows: CheapSharkGameRow[],
  game: PriceLookupGame,
): string | null {
  if (by === 'steam') {
    const row = rows.find(
      (r) => game.steamAppId != null && r.steamAppID === String(game.steamAppId),
    );
    return row?.gameID ?? null;
  }
  const want = normalizeTitle(game.name);
  if (!want) return null;
  const same = rows.filter((r) => {
    if (!r.gameID || !r.external || normalizeTitle(r.external) !== want) return false;
    // The same words but another Steam app is another game (a demo, a remaster).
    return !(game.steamAppId != null && r.steamAppID && r.steamAppID !== String(game.steamAppId));
  });
  return same.length === 1 ? same[0]!.gameID! : null;
}

const num = (s: string | undefined): number | null => {
  const n = s === undefined ? NaN : Number(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

/**
 * Price info from a game's CheapShark detail: the cheapest deal on an active store (every store
 * when the list is unknown) and the historic low. Null when it has neither.
 */
export function toPriceInfo(
  detail: CheapSharkGameDetail,
  stores: CheapSharkStore[] | null,
): PriceInfo | null {
  const byId = new Map(stores?.map((s) => [s.storeID, s]));
  let best: PriceInfo['best'] = null;
  for (const d of detail.deals ?? []) {
    const price = num(d.price);
    if (price === null || !d.dealID || !d.storeID) continue;
    const store = byId.get(d.storeID);
    if (stores && !store?.isActive) continue;
    if (best && best.price <= price) continue;
    const retail = Math.max(num(d.retailPrice) ?? price, price);
    best = {
      store: store?.storeName ?? `Store ${d.storeID}`,
      price,
      retailPrice: retail,
      savingsPct: retail > price ? Math.min(100, Math.round(Number(d.savings) || 0)) : 0,
      url: REDIRECT + d.dealID,
    };
  }
  const low = detail.cheapestPriceEver;
  const lowPrice = num(low?.price);
  const historicLow =
    lowPrice === null
      ? null
      : {
          price: lowPrice,
          date: typeof low?.date === 'number' ? new Date(low.date * 1000).toISOString() : null,
        };
  if (!best && !historicLow) return null;
  const parsed = priceInfoSchema.safeParse({ currency: 'USD', best, historicLow });
  return parsed.success ? parsed.data : null;
}
