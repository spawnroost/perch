import { z } from 'zod';
import { exportImportResultSchema } from '../library-export/schemas.js';

/** `GET /api/v2/search/{gamertag}`: people matching the text, best guess first. */
export const xboxSearchResponseSchema = z.object({
  content: z.object({
    people: z
      .array(
        z.object({
          xuid: z.string(),
          gamertag: z.string().nullish(),
          modernGamertag: z.string().nullish(),
          uniqueModernGamertag: z.string().nullish(),
        }),
      )
      .nullish(),
  }),
});

/** `GET /api/v2/player/titleHistory/{xuid}`. Only the fields Perch reads. */
export const xboxTitleHistoryResponseSchema = z.object({
  content: z.object({
    titles: z
      .array(
        z.object({
          titleId: z.string(),
          name: z.string(),
          type: z.string().nullish(),
          devices: z.array(z.string()).nullish(),
          titleHistory: z
            .object({
              lastTimePlayed: z.string().nullish(),
              visible: z.boolean().nullish(),
            })
            .nullish(),
          achievement: z.object({ progressPercentage: z.number().nullish() }).nullish(),
        }),
      )
      .nullish(),
  }),
});

export interface XboxTitle {
  titleId: string;
  /** Cleaned name (store suffixes and trademark signs removed). */
  name: string;
  platform: 'xbox' | 'pc';
  lastPlayed: Date | null;
  /** Achievement progress 0-100; 0 when unknown. */
  achievementProgress: number;
}

export interface XboxProfile {
  xuid: string;
  gamertag: string;
}

export const xboxLinkSchema = z.object({
  gamertag: z.string().trim().min(1).max(40),
});

/** Same shape as the export-file import: new/updated counts and up to 50 unmatched titles. */
export const xboxSyncResultSchema = exportImportResultSchema;
export type XboxSyncResult = z.infer<typeof xboxSyncResultSchema>;

/** Error codes of the Xbox link/sync routes. */
export const XBOX_SYNC_ERROR_CODES = [
  'xbox_not_linked',
  'xbox_not_found',
  'xbox_private',
  'xbox_not_configured',
  'xbox_busy',
  'xbox_cooldown',
  'xbox_unavailable',
] as const;
export type XboxSyncErrorCode = (typeof XBOX_SYNC_ERROR_CODES)[number];

export const xboxSyncErrorSchema = z.object({
  error: z.enum(XBOX_SYNC_ERROR_CODES),
  message: z.string(),
  /** Seconds until the next try; only with xbox_cooldown. */
  retryAfter: z.number().int().positive().optional(),
});
export type XboxSyncError = z.infer<typeof xboxSyncErrorSchema>;

export const XBOX_PRIVATE_HELP =
  'No game history found. On Xbox open Privacy & online safety, set "Others can see your game history" to Everyone, then sync again.';
export const XBOX_NOT_CONFIGURED_HELP = 'Xbox import is not set up on this server.';
export const XBOX_UNAVAILABLE_HELP = 'Xbox could not be reached. Try again in a moment.';
export const XBOX_NOT_LINKED_HELP = 'Link your Xbox gamertag before syncing.';
export const XBOX_NOT_FOUND_HELP = 'No Xbox profile with that gamertag. Check the spelling.';
export const XBOX_BUSY_HELP = 'Xbox sync is busy, try again later.';
export const XBOX_COOLDOWN_HELP = 'Try again in a minute.';
