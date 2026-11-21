import { z } from 'zod';
import { STATUSES } from '../library/fields.js';

const gameArt = {
  igdbId: z.number().int(),
  name: z.string(),
  coverUrl: z.string().nullable(),
};

/** What the taste card shows: one user's library, boiled down. Built by `tasteSummary`. */
export const tasteSummarySchema = z.object({
  /** True when the library has no games; every other field is then empty or zero. */
  empty: z.boolean(),
  gameCount: z.number().int().nonnegative(),
  totalHours: z.number().nonnegative(),
  /** Top genres and themes by taste weight (ratings included), strongest first, at most 5. */
  topTastes: z.array(
    z.object({
      kind: z.enum(['genre', 'theme']),
      name: z.string(),
      /** 0-1, the strongest taste is 1. */
      weight: z.number(),
    }),
  ),
  mostPlayed: z.object({ ...gameArt, hours: z.number(), accent: z.string().nullable() }).nullable(),
  /** E.g. "Metroidvania explorer", with the taste labels it came from; null for an empty library. */
  playstyle: z.object({ label: z.string(), tags: z.array(z.string()) }).nullable(),
  statusCounts: z.record(z.enum(STATUSES), z.number().int().nonnegative()),
  /** Games per platform (a game on two platforms counts on both); shares add up to 1. */
  platforms: z.array(
    z.object({
      platform: z.string(),
      games: z.number().int().positive(),
      share: z.number().min(0).max(1),
    }),
  ),
  /** Games rated 4 or 5, best first, at most 5. */
  topRated: z.array(z.object({ ...gameArt, rating: z.number().int().min(4).max(5) })),
  /** Covers for the card's collage, heaviest taste first. */
  covers: z.array(z.object({ ...gameArt, accent: z.string().nullable() })),
});

export type TasteSummary = z.infer<typeof tasteSummarySchema>;
