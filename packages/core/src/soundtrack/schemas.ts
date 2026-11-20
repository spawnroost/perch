import { z } from 'zod';

/** Longest track list kept per album. */
export const SOUNDTRACK_MAX_TRACKS = 12;

export const soundtrackTrackSchema = z.object({
  name: z.string(),
  number: z.number().int().positive(),
  durationMs: z.number().int().nonnegative().nullable(),
  previewUrl: z.string().url().nullable(),
});

export const soundtrackSchema = z.object({
  albumName: z.string(),
  artist: z.string(),
  artworkUrl: z.string().url().nullable(),
  appleMusicUrl: z.string().url(),
  tracks: z.array(soundtrackTrackSchema).max(SOUNDTRACK_MAX_TRACKS),
});

export const soundtrackLinksSchema = z.object({
  spotify: z.string().url(),
  youtube: z.string().url(),
  appleMusic: z.string().url(),
});

/** `soundtrack` is null when no album could be matched with confidence. */
export const soundtrackResponseSchema = z.object({
  soundtrack: soundtrackSchema.nullable(),
  links: soundtrackLinksSchema,
});

export type SoundtrackTrack = z.infer<typeof soundtrackTrackSchema>;
export type Soundtrack = z.infer<typeof soundtrackSchema>;
export type SoundtrackLinks = z.infer<typeof soundtrackLinksSchema>;
export type SoundtrackResponse = z.infer<typeof soundtrackResponseSchema>;
