import { z } from 'zod';
import { isoDate } from './common.js';
import { deckCategorySchema, deviceFitSchema, fitStatusSchema, timeToBeatSchema } from './games.js';

export const recommendationsQuerySchema = z.object({
  /** A device id or preset id, 'all' (default) or 'none' (no device filtering). */
  device: z.string().trim().min(1).max(64).optional(),
  limit: z.coerce.number().int().min(1).max(60).default(20),
});

export const recommendationSchema = z.object({
  rank: z.number().int(),
  score: z.number(),
  backlog: z.boolean(),
  reason: z.string(),
  /** The library game this pick is closest to (what "Because you played" groups by). */
  sourceGame: z.object({ igdbId: z.number().int(), name: z.string() }).nullable(),
  game: z.object({
    igdbId: z.number().int(),
    name: z.string(),
    coverUrl: z.string().nullable(),
    coverUrlSmall: z.string().nullable(),
    heroUrl: z.string().nullable(),
    /** Dominant cover colour, #rrggbb. */
    accent: z.string().nullable(),
    firstRelease: isoDate.nullable(),
    rating: z.number().nullable(),
  }),
  /** Best fit over the devices the `device` param selected; absent when it was 'none'. */
  fit: z.object({ status: fitStatusSchema.exclude(['hidden']), deviceId: z.string() }).optional(),
  /** Fit on every device the user has, whatever the `device` param. */
  fits: z.array(deviceFitSchema),
  /** Steam Deck category; null without a Deck, a Steam app or a Steam answer. */
  deck: deckCategorySchema.nullable(),
  timeToBeat: timeToBeatSchema,
});

export const recommendationsResponseSchema = z.object({
  recommendations: z.array(recommendationSchema),
});

export type RecommendationsResponse = z.infer<typeof recommendationsResponseSchema>;
