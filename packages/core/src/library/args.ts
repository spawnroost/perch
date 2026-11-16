import { z } from 'zod';
import { dateField, hoursField, statusField } from './fields.js';

/** Parsed `perch add` options (CLI strings in, typed values out). */
export const addArgsSchema = z
  .object({
    name: z.string().trim().min(1, 'game name required'),
    hours: hoursField.optional(),
    last: dateField.optional(),
    status: statusField.optional(),
    platform: z.string().trim().min(1).toLowerCase().default('pc'),
    owned: z.boolean().default(false),
    igdb: z.coerce.number().int().positive().optional(),
  })
  .transform(({ last, ...rest }) => ({ ...rest, lastPlayed: last }));
export type AddArgs = z.output<typeof addArgsSchema>;

export const userCreateSchema = z
  .object({
    email: z.email().transform((e) => e.toLowerCase()),
    name: z.string().trim().min(1).optional(),
  })
  .transform(({ email, name }) => ({ email, name: name ?? email.split('@')[0]! }));
