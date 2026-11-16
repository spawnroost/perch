import { z } from 'zod';
import { dateField } from '../library/fields.js';

/** IGDB game id in a JSON body. */
export const igdbIdSchema = z.number().int().positive();
/** IGDB game id in a URL path segment. */
export const igdbIdParamSchema = z.object({ igdbId: z.coerce.number().int().positive() });
export const idParamSchema = z.object({ id: z.uuid() });

export const isoDate = z.iso.datetime();
/** `YYYY-MM-DD` or a full ISO timestamp, parsed to a Date. */
export const dateInputSchema = z.union([dateField, z.iso.datetime().transform((s) => new Date(s))]);

export const okSchema = z.object({ ok: z.literal(true) });
export const errorSchema = z.object({ error: z.string() });
