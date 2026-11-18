import { z } from 'zod';
import { STORE_IDS } from '../game-facts/stores.js';
import { isoDate } from './common.js';

export const gameSearchQuerySchema = z.object({ q: z.string().trim().min(1).max(100) });

export const gameSearchResponseSchema = z.object({
  results: z.array(
    z.object({
      igdbId: z.number().int(),
      name: z.string(),
      slug: z.string().nullable(),
      ratingCount: z.number(),
      firstRelease: isoDate.nullable(),
      coverUrl: z.string().nullable(),
      coverUrlSmall: z.string().nullable(),
    }),
  ),
});

export const fitStatusSchema = z.enum(['green', 'yellow', 'unknown', 'hidden']);
export const deckCategorySchema = z.enum(['verified', 'playable', 'unsupported', 'unknown']);

/** Will-it-run of a game on one of the user's devices, with the reason behind the status. */
export const deviceFitSchema = z.object({
  deviceId: z.string(),
  deviceName: z.string(),
  status: fitStatusSchema,
  reason: z.string(),
});

/** IGDB time-to-beat in hours; null when IGDB has no (or too little) data. */
export const timeToBeatSchema = z
  .object({
    hastilyHours: z.number().nullable(),
    normallyHours: z.number().nullable(),
    completelyHours: z.number().nullable(),
  })
  .nullable();

/** Critic score, Steam reviews and where to buy / read more; each part is empty when unknown. */
export const gameFactsSchema = z.object({
  critic: z.object({ score: z.number().int(), count: z.number().nullable() }).nullable(),
  steamReviews: z
    .object({ desc: z.string(), pct: z.number().int(), total: z.number().int() })
    .nullable(),
  stores: z.array(z.object({ store: z.enum(STORE_IDS), url: z.string() })),
  links: z.array(z.object({ label: z.string(), url: z.string() })),
});

export const gameDetailResponseSchema = z.object({
  game: z.object({
    igdbId: z.number().int(),
    name: z.string(),
    slug: z.string(),
    coverUrl: z.string().nullable(),
    coverUrlSmall: z.string().nullable(),
    heroUrl: z.string().nullable(),
    /** Dominant cover colour, #rrggbb. */
    accent: z.string().nullable(),
    /** IGDB summary; null when absent or not fetched yet. */
    summary: z.string().nullable(),
    firstRelease: isoDate.nullable(),
    platforms: z.array(z.number().int()),
    rating: z.number().nullable(),
    ratingCount: z.number().nullable(),
    steamAppId: z.number().int().nullable(),
  }),
  /** Will-it-run per device of the user. */
  fit: z.array(deviceFitSchema),
  timeToBeat: timeToBeatSchema,
  /** Steam Deck category; null when the game has no Steam app or Steam could not be read. */
  deck: deckCategorySchema.nullable(),
  facts: gameFactsSchema,
  /** Why the engine would pick it; empty when the library says nothing yet. */
  why: z.array(z.string()),
});

/** Most games whose fit one batched request covers. */
export const FIT_BATCH_LIMIT = 8;

/** `?ids=1,2,3`: 1 to FIT_BATCH_LIMIT positive integer ids; duplicates collapse. */
export const gameFitQuerySchema = z.object({
  ids: z
    .string()
    .transform((s) => s.split(','))
    .pipe(
      z
        .array(z.string().regex(/^\d{1,15}$/, 'ids must be positive integers'))
        .min(1)
        .max(FIT_BATCH_LIMIT),
    )
    .transform((parts) => [...new Set(parts.map(Number))])
    .pipe(z.array(z.number().int().positive())),
});

/** Light per-device fit and deck category for one game. */
export const gameFitSchema = z.object({
  deck: deckCategorySchema.nullable(),
  fits: z.array(deviceFitSchema),
});

/** Batched fit keyed by IGDB id; ids that are not known games are absent. */
export const gameFitsResponseSchema = z.object({
  fits: z.record(z.string(), gameFitSchema),
});

export type GameFitEntry = z.infer<typeof gameFitSchema>;
export type GameFitsResponse = z.infer<typeof gameFitsResponseSchema>;
export type GameSearchResponse = z.infer<typeof gameSearchResponseSchema>;
export type GameDetailResponse = z.infer<typeof gameDetailResponseSchema>;
