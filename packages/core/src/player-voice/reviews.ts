import { z } from 'zod';
import type { VoiceReview } from './schemas.js';

/** Most reviews sent to the summarizer. */
export const VOICE_MAX_REVIEWS = 50;
/** Each review text is cut to this many characters. */
export const VOICE_REVIEW_MAX_CHARS = 600;
/** Reviews shorter than this (trimmed) say too little to use. */
export const VOICE_MIN_REVIEW_CHARS = 40;
/** Fewer usable reviews than this and the game gets no summary. */
export const MIN_VOICE_REVIEWS = 10;

const bodySchema = z.object({
  response: z.object({ reviews: z.array(z.unknown()).optional() }),
});

const reviewSchema = z.object({
  review: z.string(),
  voted_up: z.boolean().optional(),
  votes_up: z.number().optional(),
  author: z.object({ playtime_at_review: z.number().optional() }).partial().optional(),
  primarily_steam_deck: z.boolean().optional(),
});

/** The most helpful usable reviews (votes_up first), trimmed and cut for the summarizer. */
export function pickReviews(raw: readonly unknown[]): VoiceReview[] {
  const usable: { votes: number; review: VoiceReview }[] = [];
  for (const entry of raw) {
    const parsed = reviewSchema.safeParse(entry);
    if (!parsed.success) continue;
    const r = parsed.data;
    const text = r.review.trim();
    if (text.length < VOICE_MIN_REVIEW_CHARS) continue;
    usable.push({
      votes: r.votes_up ?? 0,
      review: {
        text: text.slice(0, VOICE_REVIEW_MAX_CHARS),
        votedUp: r.voted_up ?? true,
        playtimeMinutes: r.author?.playtime_at_review ?? null,
        deck: r.primarily_steam_deck ?? false,
      },
    });
  }
  // Array#sort is stable, so equally helpful reviews keep Steam's order.
  return usable
    .sort((a, b) => b.votes - a.votes)
    .slice(0, VOICE_MAX_REVIEWS)
    .map((u) => u.review);
}

/**
 * The picked reviews of a Steam `GetAppReviews` body. Empty when Steam answers `{response: {}}`
 * (unknown app or no reviews) or has too few usable reviews; throws when `response` is missing,
 * so a Steam hiccup is not cached as "none".
 */
export function parseReviewTexts(body: unknown): VoiceReview[] {
  const parsed = bodySchema.parse(body);
  return pickReviews(parsed.response.reviews ?? []);
}
