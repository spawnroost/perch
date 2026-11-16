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
    }),
  ),
});

export const fitStatusSchema = z.enum(['green', 'yellow', 'unknown', 'hidden']);
export const deckCategorySchema = z.enum(['verified', 'playable', 'unsupported', 'unknown']);

export const gameDetailResponseSchema = z.object({
  game: z.object({
    igdbId: z.number().int(),
    name: z.string(),
    slug: z.string(),
    coverUrl: z.string().nullable(),
    firstRelease: isoDate.nullable(),
    platforms: z.array(z.number().int()),
    rating: z.number().nullable(),
    ratingCount: z.number().nullable(),
    steamAppId: z.number().int().nullable(),
  }),
  /** Will-it-run per device of the user. */
  fit: z.array(z.object({ deviceId: z.string(), deviceName: z.string(), status: fitStatusSchema })),
  /** Steam Deck category; null when the game has no Steam app or Steam could not be read. */
  deck: deckCategorySchema.nullable(),
  /** Why the engine would pick it; empty when the library says nothing yet. */
  why: z.array(z.string()),
});

export type GameSearchResponse = z.infer<typeof gameSearchResponseSchema>;
export type GameDetailResponse = z.infer<typeof gameDetailResponseSchema>;
