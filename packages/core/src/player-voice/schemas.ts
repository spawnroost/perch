import { z } from 'zod';

/** Longest likes / complaints list. */
export const VOICE_MAX_POINTS = 3;
/** Longest single point or Deck note, in characters. */
export const VOICE_MAX_CHARS = 120;

export const playerVoiceSchema = z.object({
  likes: z.array(z.string().min(1).max(VOICE_MAX_CHARS)).max(VOICE_MAX_POINTS),
  complaints: z.array(z.string().min(1).max(VOICE_MAX_CHARS)).max(VOICE_MAX_POINTS),
  /** What Steam Deck players say; null when no Deck review said anything. */
  deck: z.string().min(1).max(VOICE_MAX_CHARS).nullable(),
});

/** `voice` is null when the game has no Steam page, too few reviews, or no LLM is configured. */
export const playerVoiceResponseSchema = z.object({
  voice: playerVoiceSchema.nullable(),
  /** True while the summary is still being written; ask again shortly. */
  pending: z.boolean().optional(),
  steamReviewsUrl: z.string().url().nullable(),
});

export type PlayerVoice = z.infer<typeof playerVoiceSchema>;
export type PlayerVoiceResponse = z.infer<typeof playerVoiceResponseSchema>;

/** One Steam review as sent to the summarizer. */
export interface VoiceReview {
  text: string;
  votedUp: boolean;
  /** Minutes the author had played when they wrote it; null when unknown. */
  playtimeMinutes: number | null;
  /** Written mainly on a Steam Deck. */
  deck: boolean;
}

/** Turns review texts into a summary; null when the model had nothing usable to say. Throws on failure. */
export interface VoiceSummarizer {
  summarize(title: string, reviews: readonly VoiceReview[]): Promise<PlayerVoice | null>;
}

export function steamReviewsUrl(steamAppId: number | null): string | null {
  return steamAppId ? `https://store.steampowered.com/app/${steamAppId}/#app_reviews_hash` : null;
}
