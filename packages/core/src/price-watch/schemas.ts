import { z } from 'zod';
import { igdbIdSchema, isoDate } from '../schemas/common.js';
import { priceInfoSchema } from '../prices/schemas.js';

/** Most games one user can watch. */
export const WATCH_LIMIT = 100;

/** PUT /api/watches/:igdbId. `targetPrice` null means "tell me about any sale". */
export const watchBodySchema = z.object({
  // Rounded to cents first: 0.004 would otherwise pass as positive and be stored as 0.
  targetPrice: z
    .number()
    .max(10_000)
    .transform((n) => Math.round(n * 100) / 100)
    .pipe(z.number().min(0.01))
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

export const watchListResponseSchema = z.object({
  watches: z.array(watchSchema),
  /** Whether the daily price-watch email is on for this user. */
  emails: z.boolean(),
});

/** PUT /api/watches/emails. */
export const watchEmailsBodySchema = z.object({ enabled: z.boolean() });
export const watchResponseSchema = z.object({
  igdbId: igdbIdSchema,
  targetPrice: z.number().nullable(),
});

export type WatchEmailsBody = z.infer<typeof watchEmailsBodySchema>;
export type WatchBody = z.infer<typeof watchBodySchema>;
export type Watch = z.infer<typeof watchSchema>;
export type WatchListResponse = z.infer<typeof watchListResponseSchema>;
export type WatchResponse = z.infer<typeof watchResponseSchema>;
