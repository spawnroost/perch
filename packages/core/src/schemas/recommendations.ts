import { z } from 'zod';
import { isoDate } from './common.js';
import { fitStatusSchema } from './games.js';

export const recommendationsQuerySchema = z.object({
  /** A device id or preset id, 'all' (default) or 'none' (no device filtering). */
  device: z.string().trim().min(1).max(64).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const recommendationsResponseSchema = z.object({
  recommendations: z.array(
    z.object({
      rank: z.number().int(),
      score: z.number(),
      backlog: z.boolean(),
      reason: z.string(),
      game: z.object({
        igdbId: z.number().int(),
        name: z.string(),
        firstRelease: isoDate.nullable(),
        rating: z.number().nullable(),
      }),
      fit: z
        .object({ status: fitStatusSchema.exclude(['hidden']), deviceId: z.string() })
        .optional(),
    }),
  ),
});

export type RecommendationsResponse = z.infer<typeof recommendationsResponseSchema>;
