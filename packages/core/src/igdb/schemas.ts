import { z } from 'zod';
import type { StoreLink } from '../game-facts/stores.js';
import type { Multiplayer } from '../game-facts/about.js';

/** Raw IGDB response shapes (only the fields we request). IGDB omits fields that are null. */
const ids = z.array(z.number().int()).optional();

/** Bare ids, or `{ id, name }` objects when the query expands `.name`. */
const namedRefs = z
  .array(
    z.union([z.number().int(), z.object({ id: z.number().int(), name: z.string().optional() })]),
  )
  .optional()
  .transform((refs) => refs?.map((r) => (typeof r === 'number' ? { id: r } : r)));

export const igdbSearchResultSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  slug: z.string().optional(),
  total_rating_count: z.number().optional(),
  first_release_date: z.number().optional(),
  cover: z.object({ image_id: z.string() }).optional(),
});
export const igdbSearchResponseSchema = z.array(igdbSearchResultSchema);

export const igdbGameSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  slug: z.string(),
  summary: z.string().optional(),
  cover: z.object({ image_id: z.string() }).optional(),
  artworks: z.array(z.object({ image_id: z.string() })).optional(),
  screenshots: z.array(z.object({ image_id: z.string() })).optional(),
  first_release_date: z.number().optional(),
  total_rating: z.number().optional(),
  total_rating_count: z.number().optional(),
  aggregated_rating: z.number().optional(),
  aggregated_rating_count: z.number().optional(),
  websites: z
    .array(z.object({ url: z.string().optional(), type: z.number().int().optional() }))
    .optional(),
  genres: ids,
  themes: ids,
  keywords: ids,
  player_perspectives: ids,
  game_modes: ids,
  platforms: ids,
  similar_games: ids,
  collections: namedRefs,
  franchises: namedRefs,
  involved_companies: z
    .array(
      z.object({
        company: z.object({ name: z.string().optional() }).optional(),
        developer: z.boolean().optional(),
        publisher: z.boolean().optional(),
      }),
    )
    .optional(),
  multiplayer_modes: z
    .array(
      z.object({
        campaigncoop: z.boolean().optional(),
        onlinecoop: z.boolean().optional(),
        onlinecoopmax: z.number().optional(),
        offlinecoop: z.boolean().optional(),
        splitscreen: z.boolean().optional(),
      }),
    )
    .optional(),
  dlcs: ids,
  expansions: ids,
  external_games: z
    .array(
      z.object({
        uid: z.string().optional(),
        external_game_source: z.number().int().optional(),
      }),
    )
    .optional(),
});
export const igdbKeywordsResponseSchema = z.array(
  z.object({ id: z.number().int(), name: z.string() }),
);

export const igdbExternalGamesResponseSchema = z.array(
  z.object({ uid: z.string(), game: z.number().int().optional() }),
);

export const igdbNamedGamesResponseSchema = z.array(
  z.object({
    id: z.number().int(),
    name: z.string(),
    game_type: z.number().int().optional(),
    first_release_date: z.number().optional(),
  }),
);

/** A game found by exact name; `gameType` 0 is a main game. */
export interface NamedGame {
  igdbId: number;
  name: string;
  gameType: number | null;
  firstRelease: Date | null;
}

export const igdbGamesResponseSchema = z.array(igdbGameSchema);

export const igdbTimeToBeatSchema = z.object({
  game_id: z.number().int().optional(),
  hastily: z.number().optional(),
  normally: z.number().optional(),
  completely: z.number().optional(),
  count: z.number().optional(),
});
export const igdbTimeToBeatResponseSchema = z.array(igdbTimeToBeatSchema);

export const twitchTokenSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().positive(),
});

/** Franchise ids are shifted by this so they can't clash with collection ids. */
export const FRANCHISE_ID_OFFSET = 1_000_000;

/** One series id list from IGDB `collections` and `franchises` (deduplicated). */
export function seriesIds(raw: {
  collections?: Array<{ id: number }> | undefined;
  franchises?: Array<{ id: number }> | undefined;
}): number[] {
  return [
    ...new Set([
      ...(raw.collections ?? []).map((c) => c.id),
      ...(raw.franchises ?? []).map((f) => f.id + FRANCHISE_ID_OFFSET),
    ]),
  ];
}

// ---- Domain types returned by the client (match the `games` / `time_to_beat` tables) ----

export interface Game {
  igdbId: number;
  name: string;
  slug: string;
  coverUrl: string | null;
  /** Same cover at t_cover_small (90x128), for lists and thumbnails. */
  coverUrlSmall: string | null;
  /** First artwork, else first screenshot, at t_1080p; null when IGDB has neither. */
  heroUrl: string | null;
  /** Vivid dominant colour of the cover as #rrggbb; null until computed (or when none found). */
  accent: string | null;
  /** IGDB `summary`; null when IGDB has none. */
  summary: string | null;
  firstRelease: Date | null;
  genres: number[];
  themes: number[];
  keywords: number[];
  perspectives: number[];
  gameModes: number[];
  platforms: number[];
  similarIds: number[];
  /** Series ids: IGDB collection ids plus franchise ids offset by FRANCHISE_ID_OFFSET. */
  series: number[];
  /** IGDB `total_rating` (0-100). */
  rating: number | null;
  ratingCount: number | null;
  steamAppId: number | null;
  /** IGDB `aggregated_rating` (critic average, 0-100) and how many critics. */
  criticRating: number | null;
  criticRatingCount: number | null;
  /** Store links from IGDB websites. */
  websites: StoreLink[];
  developers: string[];
  publishers: string[];
  /** Merged co-op / split-screen info; null when IGDB lists no multiplayer modes. */
  multiplayer: Multiplayer | null;
  dlcCount: number;
  expansionCount: number;
  /** Display name of the first collection (else franchise); null when none. */
  seriesName: string | null;
}

export interface GameCandidate {
  igdbId: number;
  name: string;
  slug: string | null;
  ratingCount: number;
  firstRelease: Date | null;
  /** t_cover_big cover URL; null when IGDB has no art. */
  coverUrl: string | null;
  /** t_cover_small (90x128) cover URL. */
  coverUrlSmall: string | null;
}

export interface SearchResult {
  /** Highest `total_rating_count` among the candidates (name search returns junk duplicates). */
  best: GameCandidate | null;
  /** All candidates, most-rated first. */
  candidates: GameCandidate[];
}

export interface TimeToBeat {
  hastilySeconds: number | null;
  normallySeconds: number | null;
  completelySeconds: number | null;
  count: number | null;
}
