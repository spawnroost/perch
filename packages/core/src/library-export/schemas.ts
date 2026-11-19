import { z } from 'zod';
import { playedBeforeSchema } from '../library/played-before.js';

export const EXPORT_MAX_GAMES = 5000;
export const EXPORT_UNMATCHED_SHOWN = 50;

export const EXPORT_SOURCES = ['epic', 'gog', 'other'] as const;

/** One game read from an Epic/GOG/Playnite export file. */
export const exportGameSchema = z.object({
  source: z.enum(EXPORT_SOURCES),
  /** Store product id (GOG product id, Heroic app name for Epic). */
  storeId: z.string().trim().min(1).max(200).optional(),
  title: z.string().trim().min(1).max(300),
  minutesPlayed: z.number().finite().nonnegative().max(60_000_000).optional(),
  /** ISO date-time. */
  lastPlayed: z.iso.datetime({ offset: true }).optional(),
});
export type ExportGame = z.infer<typeof exportGameSchema>;

export const exportImportSchema = z.object({
  games: z.array(exportGameSchema).max(EXPORT_MAX_GAMES),
});

export const exportImportResultSchema = z.object({
  imported: z.number().int().nonnegative(),
  updated: z.number().int().nonnegative(),
  /** Titles that could not be matched, at most 50. */
  unmatched: z.array(z.string()).max(EXPORT_UNMATCHED_SHOWN),
  unmatchedCount: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  /** New backlog entries with real history: the UI asks whether they are paused. */
  playedBefore: z.array(playedBeforeSchema),
});
export type ExportImportResult = z.infer<typeof exportImportResultSchema>;
