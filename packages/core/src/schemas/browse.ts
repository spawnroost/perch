import { z } from 'zod';
import { recommendationSchema } from './recommendations.js';

/** "1,2,3" -> [1, 2, 3] (deduped); absent or empty -> []. */
const idList = z
  .string()
  .trim()
  .transform((s) =>
    s === '' ? [] : s.split(',').map((part) => (part.trim() === '' ? NaN : Number(part))),
  )
  .pipe(z.array(z.number().int().positive()).max(30))
  .transform((ids) => [...new Set(ids)]);

export const browseQuerySchema = z
  .object({
    genres: idList.default([]),
    themes: idList.default([]),
    /** A device id or preset id; absent = any of the user's devices. */
    deviceId: z.string().trim().min(1).max(64).optional(),
    limit: z.coerce.number().int().min(1).max(60).default(20),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .refine((q) => q.genres.length + q.themes.length > 0, {
    message: 'pick at least one genre or theme',
    path: ['genres'],
  });

export type BrowseQuery = z.infer<typeof browseQuerySchema>;

export const browseResponseSchema = z.object({
  /** Same card shape as /api/recommendations; `rank` continues across pages. */
  recommendations: z.array(recommendationSchema),
  hasMore: z.boolean(),
});

export type BrowseResponse = z.infer<typeof browseResponseSchema>;

export const facetSchema = z.object({ id: z.number().int(), name: z.string() });
export type Facet = z.infer<typeof facetSchema>;

export const browseFacetsResponseSchema = z.object({
  genres: z.array(facetSchema),
  themes: z.array(facetSchema),
});

export type BrowseFacetsResponse = z.infer<typeof browseFacetsResponseSchema>;
