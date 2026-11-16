import { z } from 'zod';
import { igdbIdSchema, isoDate } from './common.js';

export const feedbackKindSchema = z.enum(['up', 'down', 'played', 'not_interested']);

export const feedbackBodySchema = z.object({ igdbId: igdbIdSchema, kind: feedbackKindSchema });
export const feedbackResponseSchema = z.object({
  igdbId: z.number().int(),
  kind: feedbackKindSchema,
});

export const profileRebuildResponseSchema = z.object({ ok: z.literal(true), builtAt: isoDate });

export type FeedbackBody = z.infer<typeof feedbackBodySchema>;
