import { z } from 'zod';
import { exportImportResultSchema } from '../library-export/schemas.js';

/** The `getUserPlayedGames` reply. Only the fields Perch reads. */
export const psnPlayedGamesSchema = z.object({
  titles: z.array(
    z.object({
      titleId: z.string(),
      name: z.string(),
      category: z.string().nullish(),
      /** ISO-8601 duration, e.g. PT132H48M23S. */
      playDuration: z.string().nullish(),
      lastPlayedDateTime: z.string().nullish(),
    }),
  ),
  totalItemCount: z.number().nullish(),
  nextOffset: z.number().nullish(),
});
export type PsnPlayedGames = z.infer<typeof psnPlayedGamesSchema>;

export interface PsnTitle {
  titleId: string;
  /** Cleaned name (trademark signs removed). */
  name: string;
  platform: 'ps4' | 'ps5';
  /** Whole minutes played; 0 when unknown. */
  minutes: number;
  lastPlayed: Date | null;
}

export interface PsnProfile {
  accountId: string;
  /** The ID as PlayStation spells it. */
  onlineId: string;
}

export const psnLinkSchema = z.object({
  onlineId: z.string().trim().min(1).max(40),
});

/** Same shape as the export-file import: new/updated counts and up to 50 unmatched titles. */
export const psnSyncResultSchema = exportImportResultSchema;
export type PsnSyncResult = z.infer<typeof psnSyncResultSchema>;

/** Error codes of the PSN link/sync routes. */
export const PSN_SYNC_ERROR_CODES = [
  'psn_not_linked',
  'psn_not_found',
  'psn_private',
  'psn_not_configured',
  'psn_busy',
  'psn_cooldown',
  'psn_unavailable',
] as const;
export type PsnSyncErrorCode = (typeof PSN_SYNC_ERROR_CODES)[number];

export const psnSyncErrorSchema = z.object({
  error: z.enum(PSN_SYNC_ERROR_CODES),
  message: z.string(),
  /** Seconds until the next try; only with psn_cooldown. */
  retryAfter: z.number().int().positive().optional(),
});
export type PsnSyncError = z.infer<typeof psnSyncErrorSchema>;

export const PSN_PRIVATE_HELP =
  'No game history found. In PlayStation privacy settings set "Gaming history" to Anyone, then sync again.';
/** Also the answer when the server's NPSSO has expired: the user cannot fix either. */
export const PSN_NOT_CONFIGURED_HELP = 'PlayStation import is unavailable right now.';
export const PSN_UNAVAILABLE_HELP = 'PlayStation could not be reached. Try again in a moment.';
export const PSN_NOT_LINKED_HELP = 'Link your PlayStation online ID before syncing.';
export const PSN_NOT_FOUND_HELP = 'No PlayStation profile with that online ID. Check the spelling.';
export const PSN_BUSY_HELP = 'PlayStation sync is busy, try again later.';
export const PSN_COOLDOWN_HELP = 'Try again in a minute.';
