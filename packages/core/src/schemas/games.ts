import { z } from 'zod';
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
  /** Why the engine would pick it; empty when the library says nothing yet. */
  why: z.array(z.string()),
});

/** Light per-device fit for one game (search results fill this lazily). */
export const gameFitResponseSchema = z.object({
  deck: deckCategorySchema.nullable(),
  fits: z.array(deviceFitSchema),
});

export type GameFitResponse = z.infer<typeof gameFitResponseSchema>;
export type GameSearchResponse = z.infer<typeof gameSearchResponseSchema>;
export type GameDetailResponse = z.infer<typeof gameDetailResponseSchema>;
