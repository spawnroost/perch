import { z } from 'zod';

export const STATUSES = ['playing', 'finished', 'dropped', 'backlog', 'paused'] as const;
export type Status = (typeof STATUSES)[number];

/** Hours as a number (JSON bodies). "" and booleans are rejected, not coerced to 0/1. */
export const hoursField = z.number().finite().nonnegative();

/** Hours typed as text (CLI args, import lines). */
export const hoursTextField = z
  .string()
  .trim()
  .regex(/^\d+(?:\.\d+)?$/, 'expected a number')
  .transform(Number)
  .pipe(hoursField);

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
