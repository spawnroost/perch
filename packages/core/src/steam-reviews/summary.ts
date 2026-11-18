import { z } from 'zod';

export interface SteamReviews {
  /** Steam's label, e.g. "Very Positive". */
  desc: string;
  /** Share of positive reviews, 0-100. */
  pct: number;
  total: number;
}

const bodySchema = z.object({
  success: z.literal(1),
  query_summary: z.object({
    review_score_desc: z.string().min(1),
    total_positive: z.number().int().nonnegative(),
    total_reviews: z.number().int().nonnegative(),
  }),
});

/** Reads an `appreviews?num_per_page=0` body; null when it has no reviews or is unreadable. */
export function parseReviewSummary(body: unknown): SteamReviews | null {
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return null;
  const { review_score_desc, total_positive, total_reviews } = parsed.data.query_summary;
  if (total_reviews === 0) return null;
  return {
    desc: review_score_desc,
    pct: Math.round((total_positive / total_reviews) * 100),
    total: total_reviews,
  };
}
