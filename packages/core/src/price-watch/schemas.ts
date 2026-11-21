import { z } from 'zod';
import { igdbIdSchema, isoDate } from '../schemas/common.js';
import { priceInfoSchema } from '../prices/schemas.js';

/** Most games one user can watch. */
export const WATCH_LIMIT = 100;

/** PUT /api/watches/:igdbId. `targetPrice` null means "tell me about any sale". */
export const watchBodySchema = z.object({
  targetPrice: z
    .number()
    .positive()
    .max(10_000)
    .transform((n) => Math.round(n * 100) / 100)
    .nullable(),
});

export const watchSchema = z.object({
  igdbId: igdbIdSchema,
  name: z.string(),
  slug: z.string(),
  coverUrlSmall: z.string().nullable(),
  accent: z.string().nullable(),
  targetPrice: z.number().nullable(),
  createdAt: isoDate,
  /** Cached prices; null while unknown (the first lookup runs in the background) or not sold. */
  prices: priceInfoSchema.nullable(),
});

export const watchListResponseSchema = z.object({ watches: z.array(watchSchema) });
export const watchResponseSchema = z.object({
  igdbId: igdbIdSchema,
  targetPrice: z.number().nullable(),
});

export type WatchBody = z.infer<typeof watchBodySchema>;
export type Watch = z.infer<typeof watchSchema>;
export type WatchListResponse = z.infer<typeof watchListResponseSchema>;
export type WatchResponse = z.infer<typeof watchResponseSchema>;
