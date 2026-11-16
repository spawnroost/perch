import { z } from 'zod';
import { STATUSES, hoursField } from '../library/fields.js';
import { dateInputSchema, igdbIdSchema, isoDate } from './common.js';

export const statusSchema = z.enum(STATUSES);
const hours = hoursField.max(1_000_000);

export const libraryEntrySchema = z.object({
  id: z.uuid(),
  igdbId: z.number().int(),
  name: z.string(),
  coverUrl: z.string().nullable(),
  platform: z.string(),
  hoursPlayed: z.number().nullable(),
  lastPlayed: isoDate.nullable(),
  status: statusSchema,
  owned: z.boolean(),
  source: z.string(),
  addedAt: isoDate,
});
export const libraryListResponseSchema = z.object({ entries: z.array(libraryEntrySchema) });
export const libraryEntryResponseSchema = z.object({ entry: libraryEntrySchema });

const platformSchema = z.string().trim().min(1).max(40).toLowerCase();

export const libraryCreateSchema = z.object({
  igdbId: igdbIdSchema,
  platform: platformSchema.default('pc'),
  hoursPlayed: hours.optional(),
  lastPlayed: dateInputSchema.optional(),
  status: statusSchema.optional(),
  owned: z.boolean().optional(),
});

export const libraryPatchSchema = z
  .object({
    hoursPlayed: hours.nullable().optional(),
    lastPlayed: dateInputSchema.nullable().optional(),
    status: statusSchema.optional(),
    owned: z.boolean().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), 'nothing to update');

export const IMPORT_MAX_LINES = 100;

export const importPreviewSchema = z.object({ text: z.string().min(1).max(100_000) });

const suggestionSchema = z.object({
  igdbId: z.number().int(),
  name: z.string(),
  year: z.number().int().nullable(),
});
export const importPreviewResponseSchema = z.object({
  lines: z.array(
    z.object({
      line: z.number().int(),
      name: z.string(),
      hoursPlayed: z.number().nullable(),
      lastPlayed: isoDate.nullable(),
      status: statusSchema.nullable(),
      match: suggestionSchema.nullable(),
      suggestions: z.array(suggestionSchema),
    }),
  ),
  errors: z.array(z.object({ line: z.number().int(), error: z.string() })),
});

export const importConfirmSchema = z.object({
  platform: platformSchema.default('pc'),
  owned: z.boolean().optional(),
  items: z
    .array(
      z.object({
        igdbId: igdbIdSchema,
        hoursPlayed: hours.optional(),
        lastPlayed: dateInputSchema.optional(),
        status: statusSchema.optional(),
      }),
    )
    .min(1)
    .max(IMPORT_MAX_LINES),
});
export const importConfirmResponseSchema = z.object({
  imported: z.array(z.object({ igdbId: z.number().int(), name: z.string() })),
  failed: z.array(z.object({ igdbId: z.number().int(), error: z.string() })),
});

export type LibraryEntry = z.infer<typeof libraryEntrySchema>;
export type LibraryCreate = z.input<typeof libraryCreateSchema>;
export type LibraryPatchInput = z.input<typeof libraryPatchSchema>;
export type ImportPreviewResponse = z.infer<typeof importPreviewResponseSchema>;
export type ImportConfirm = z.input<typeof importConfirmSchema>;
