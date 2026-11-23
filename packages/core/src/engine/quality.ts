import { IGDB_PLATFORM } from '../devices/presets.js';

const MOBILE = new Set<number>([IGDB_PLATFORM.ios, IGDB_PLATFORM.android]);
/** Windows Phone and Windows Mobile: dead platforms, ignored when deciding "mobile only". */
const DEAD_MOBILE = new Set<number>([IGDB_PLATFORM.windowsPhone, IGDB_PLATFORM.windowsMobile]);
/** IGDB `game_type` of a main game (not DLC, port, mod, ...). */
export const MAIN_GAME_TYPE = 0;
/** Mobile-only games need at least this many ratings (the store catalogs are full of shovelware). */
export const MOBILE_MIN_RATING_COUNT = 20;

/** IGDB keyword ids: free-to-play, microtransaction, gacha, in-app purchases, loot boxes. */
export const F2P_KEYWORDS: ReadonlySet<number> = new Set([2385, 4400, 25210, 23778, 4358]);
/** Big mobile F2P games IGDB does not keyword-tag. Only games that are F2P-only belong here. */
export const F2P_SLUGS: ReadonlySet<string> = new Set([
  'clash-royale',
  'clash-of-clans',
  'candy-crush-saga',
  'brawl-stars',
  'pokemon-go',
  'subway-surfers',
  'genshin-impact',
  'honkai-star-rail',
  'roblox',
]);

export interface FreeToPlayGame {
  slug?: string | null;
  keywords?: readonly number[] | null;
}

/** True when the game is free-to-play / gacha: a matching IGDB keyword, or a curated slug. */
export function isFreeToPlay(game: FreeToPlayGame): boolean {
  if (game.slug && F2P_SLUGS.has(game.slug)) return true;
  return (game.keywords ?? []).some((k) => F2P_KEYWORDS.has(k));
}

export interface QualityGame {
  platforms?: readonly number[];
  coverUrl?: string | null;
  ratingCount?: number | null;
  gameType?: number | null;
}

/** True when the game's only platforms are iOS and/or Android (ignoring dead Windows mobile ones). */
export function isMobileOnly(game: Pick<QualityGame, 'platforms'>): boolean {
  const live = (game.platforms ?? []).filter((p) => !DEAD_MOBILE.has(p));
  return live.length > 0 && live.every((p) => MOBILE.has(p));
}

/**
 * Candidate quality floor. Mobile-only games need a cover, 20+ ratings and to be a main game
 * (null game type = row cached before the column existed: let it through until it refreshes).
 * Other games keep the floor of the IGDB query that returned them.
 */
export function meetsQualityFloor(game: QualityGame): boolean {
  if (!isMobileOnly(game)) return true;
  return (
    !!game.coverUrl &&
    (game.ratingCount ?? 0) >= MOBILE_MIN_RATING_COUNT &&
    (game.gameType ?? MAIN_GAME_TYPE) === MAIN_GAME_TYPE
  );
}
