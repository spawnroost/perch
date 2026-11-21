import { z } from 'zod';
import { MOODS } from '../engine/roulette.js';
import { recommendationSchema } from './recommendations.js';

export const rouletteMoodSchema = z.enum(MOODS);

/** Most ids `exclude` may carry (the client keeps the last 5 picks). */
export const ROULETTE_MAX_EXCLUDE = 10;

export const rouletteQuerySchema = z.object({
  /** A device id or preset id, 'all' (default) or 'none' (no device filtering). */
  device: z.string().trim().min(1).max(64).optional(),
  /** Time available; ranks short games higher for short sessions. */
  minutes: z.coerce.number().int().min(5).max(480).optional(),
  mood: rouletteMoodSchema.optional(),
  /** Comma-separated igdb ids not to pick again, e.g. `12,40`. */
  exclude: z
    .string()
    .trim()
    .max(200)
    .transform((v) => (v === '' ? [] : v.split(',').map((s) => s.trim())))
    .pipe(
      z
        .array(
          z
            .string()
            .regex(/^\d{1,9}$/, 'not an igdb id')
            .transform(Number),
        )
        .max(ROULETTE_MAX_EXCLUDE),
    )
    .optional(),
});

export type RouletteQuery = z.input<typeof rouletteQuerySchema>;

export const rouletteResponseSchema = z.object({
  /** Null when the backlog is empty (or nothing in it fits the device). */
  pick: recommendationSchema.extend({ sessionReason: z.string() }).nullable(),
  /** Which filter was dropped to find the pick; null when none was. */
  relaxed: z.enum(['mood', 'exclude', 'both']).nullable(),
});

export type RouletteResponse = z.infer<typeof rouletteResponseSchema>;
