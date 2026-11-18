import { STORE_IDS, type StoreLink } from './stores.js';
import type { SteamReviews } from '../steam-reviews/summary.js';
import { buildAbout, type AboutInput, type GameAbout } from './about.js';

export * from './about.js';

export { STORE_IDS, STORE_WEBSITE_TYPE, parseStoreWebsites } from './stores.js';
export type { StoreId, StoreLink } from './stores.js';

export interface ExternalLink {
  label: string;
  url: string;
}

export interface GameFacts {
  /** IGDB critic average (0-100, rounded); null when IGDB has none. */
  critic: { score: number; count: number | null } | null;
  steamReviews: SteamReviews | null;
  stores: StoreLink[];
  links: ExternalLink[];
  about: GameAbout;
}

export interface GameFactsInput extends AboutInput {
  name: string;
  steamAppId: number | null;
  websites: readonly StoreLink[];
  criticRating: number | null;
  criticRatingCount: number | null;
}

/** One link per store in a fixed order, with the Steam page from the app id when IGDB has none. */
export function storeLinks(game: Pick<GameFactsInput, 'websites' | 'steamAppId'>): StoreLink[] {
  const byStore = new Map<string, StoreLink>();
  for (const w of game.websites) if (!byStore.has(w.store)) byStore.set(w.store, w);
  if (!byStore.has('steam') && game.steamAppId) {
    byStore.set('steam', {
      store: 'steam',
      url: `https://store.steampowered.com/app/${game.steamAppId}`,
    });
  }
  return STORE_IDS.flatMap((id) => byStore.get(id) ?? []);
}

/** Search pages on third-party sites; they need no API and cannot go stale. */
export function externalLinks(name: string): ExternalLink[] {
  const q = encodeURIComponent(name);
  return [
    { label: 'OpenCritic', url: `https://opencritic.com/search?criteria=${q}` },
    { label: 'Reddit', url: `https://www.reddit.com/search/?q=${q}` },
  ];
}

export function buildGameFacts(game: GameFactsInput, steamReviews: SteamReviews | null): GameFacts {
  return {
    critic:
      game.criticRating === null
        ? null
        : { score: Math.round(game.criticRating), count: game.criticRatingCount },
    steamReviews,
    stores: storeLinks(game),
    links: externalLinks(game.name),
    about: buildAbout(game),
  };
}
