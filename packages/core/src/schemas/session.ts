import { z } from 'zod';
import { recommendationSchema } from './recommendations.js';

export const sessionQuerySchema = z.object({
  /** How long the player has to play. */
  minutes: z.coerce.number().int().min(5).max(480),
  /** Battery left on a handheld, 0-100. */
  battery: z.coerce.number().int().min(0).max(100).optional(),
  /** A device id or preset id; defaults to the user's default device. */
  deviceId: z.string().trim().min(1).max(64).optional(),
});

export type SessionQuery = z.infer<typeof sessionQuerySchema>;

export const sessionResponseSchema = z.object({
  recommendations: z.array(
    recommendationSchema.extend({
      /** Why this pick suits the session, e.g. "Runs fit in 40 min". */
      sessionReason: z.string(),
    }),
  ),
});

export type SessionResponse = z.infer<typeof sessionResponseSchema>;
