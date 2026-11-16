import { z } from 'zod';

export const STATUSES = ['playing', 'finished', 'dropped', 'backlog'] as const;
export type Status = (typeof STATUSES)[number];

export const hoursField = z.coerce.number().finite().nonnegative();

/** `YYYY-MM-DD` (a real calendar date) -> Date at UTC midnight. */
export const dateField = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD')
  .transform((s, ctx) => {
    const d = new Date(`${s}T00:00:00Z`);
    if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) {
      ctx.addIssue({ code: 'custom', message: `invalid date ${s}` });
      return z.NEVER;
    }
    return d;
  });

export const statusField = z.enum(STATUSES);
