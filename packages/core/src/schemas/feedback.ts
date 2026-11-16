import { z } from 'zod';
import { igdbIdParamSchema, igdbIdSchema, isoDate } from './common.js';

export const feedbackKindSchema = z.enum(['up', 'down', 'played', 'not_interested']);

export const feedbackBodySchema = z.object({ igdbId: igdbIdSchema, kind: feedbackKindSchema });
/**
 * POST sets a kind (idempotent; up and down replace each other, played and not_interested stack).
 * DELETE /api/feedback/:igdbId/:kind undoes that kind. GET returns the kind sent most recently
 * per game, keyed by IGDB id.
 */
export const feedbackParamSchema = igdbIdParamSchema.extend({ kind: feedbackKindSchema });
export const feedbackListResponseSchema = z.object({
  feedback: z.record(z.string(), feedbackKindSchema),
});
export const feedbackResponseSchema = z.object({
  igdbId: z.number().int(),
  kind: feedbackKindSchema,
});

export const profileRebuildResponseSchema = z.object({ ok: z.literal(true), builtAt: isoDate });

export type FeedbackListResponse = z.infer<typeof feedbackListResponseSchema>;
export type FeedbackBody = z.infer<typeof feedbackBodySchema>;
